const Interview    = require('../models/Interview');
const Application  = require('../models/Application');
const { sendEmail, emailTemplates } = require('../utils/email');
const { createNotification }        = require('../utils/notifications');

// ─────────────────────────────────────────────────────────────────────────────
// Helper: safe socket emit — never throws even if io is not ready
// ─────────────────────────────────────────────────────────────────────────────
const safeEmit = (req, room, event, data) => {
  try {
    const io = req.app.get('io');   // correct way — req.io was NEVER set
    if (io) io.to(room).emit(event, data);
  } catch (_) {}
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/interviews/schedule
// ─────────────────────────────────────────────────────────────────────────────
exports.scheduleInterview = async (req, res) => {
  try {
    const {
      applicationId, scheduledAt, format, round, roundName,
      venue, duration, interviewers, agenda,
      meetingUrl        // company pastes a Google Meet / Zoom link
    } = req.body;

    // ── Validate ──────────────────────────────────────────────────────────
    if (!applicationId || !scheduledAt) {
      return res.status(400).json({ message: 'applicationId and scheduledAt are required' });
    }
    if (format === 'virtual' && !meetingUrl) {
      return res.status(400).json({ message: 'A meeting link is required for virtual interviews' });
    }

    const application = await Application.findById(applicationId)
      .populate('student', 'name email')
      .populate('job', 'title');

    if (!application) {
      return res.status(404).json({ message: 'Application not found' });
    }

    // ── Create interview ──────────────────────────────────────────────────
    const interview = await Interview.create({
      application : applicationId,
      student     : application.student._id,
      company     : req.user._id,
      job         : application.job._id,
      scheduledAt,          // already correct UTC (frontend sends with +05:30 offset)
      format,
      round,
      roundName,
      duration    : duration || 60,
      venue,
      interviewers,
      agenda,
      meetingUrl  : format === 'virtual' ? meetingUrl : null,
      meetingRoomName: null
    });

    // ── Update application status ─────────────────────────────────────────
    application.status = 'interview_scheduled';
    application.timeline.push({
      status    : 'interview_scheduled',
      note      : `${roundName} scheduled for ${new Date(scheduledAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST`,
      updatedBy : req.user._id
    });
    await application.save();

    // ── Send email (non-blocking — failure will NOT break the response) ───
    try {
      const companyName = req.user.companyName || 'Company';
      const { subject, html } = emailTemplates.interviewScheduled(
        application.student.name,
        application.job.title,
        companyName,
        scheduledAt, format, meetingUrl, venue, roundName
      );
      await sendEmail({ to: application.student.email, subject, html });
    } catch (emailErr) {
      console.error('Email failed (non-fatal):', emailErr.message);
    }

    // ── Real-time notification (non-blocking) ─────────────────────────────
    try {
      const io = req.app.get('io');
      await createNotification(io, {
        recipient : application.student._id,
        type      : 'interview_scheduled',
        title     : 'Interview Scheduled',
        message   : `${roundName} for ${application.job.title} on ${new Date(scheduledAt).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}`,
        link      : '/student/interviews'
      });
      safeEmit(req, application.student._id.toString(), 'interview-scheduled', { interview });
    } catch (notifErr) {
      console.error('Notification failed (non-fatal):', notifErr.message);
    }

    // ── Return populated interview ────────────────────────────────────────
    const populated = await Interview.findById(interview._id)
      .populate('student', 'name email department cgpa rollNumber skills resumeUrl')
      .populate('job', 'title')
      .populate('company', 'name companyName');

    return res.status(201).json(populated);

  } catch (err) {
    console.error('scheduleInterview error:', err);
    return res.status(500).json({ message: err.message || 'Failed to schedule interview' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/interviews/my
// ─────────────────────────────────────────────────────────────────────────────
exports.getMyInterviews = async (req, res) => {
  try {
    const query = req.user.role === 'student'
      ? { student: req.user._id }
      : { company: req.user._id };

    const interviews = await Interview.find(query)
      .populate('student',     'name email avatar department cgpa rollNumber skills resumeUrl')
      .populate('job',         'title type')
      .populate('company',     'name companyName logoUrl')
      .populate('application', 'status')
      .sort({ scheduledAt: 1 });

    return res.json(interviews);
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/interviews/:id
// ─────────────────────────────────────────────────────────────────────────────
exports.getInterviewById = async (req, res) => {
  try {
    const interview = await Interview.findById(req.params.id)
      .populate('student',     'name email department cgpa rollNumber skills resumeUrl')
      .populate('job',         'title type package')
      .populate('company',     'name companyName logoUrl industry')
      .populate('application');

    if (!interview) return res.status(404).json({ message: 'Interview not found' });
    return res.json(interview);
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/interviews/:id/feedback
// ─────────────────────────────────────────────────────────────────────────────
exports.submitFeedback = async (req, res) => {
  try {
    const interview = await Interview.findById(req.params.id).populate('application');
    if (!interview) return res.status(404).json({ message: 'Interview not found' });
    if (interview.company.toString() !== req.user._id.toString())
      return res.status(403).json({ message: 'Unauthorized' });

    interview.feedback = req.body.feedback;
    interview.status   = 'completed';
    await interview.save();

    if (req.body.feedback?.result === 'pass') {
      await Application.findByIdAndUpdate(interview.application._id, {
        status : 'interview_completed',
        $push  : { timeline: { status: 'interview_completed', note: `${interview.roundName} cleared`, updatedBy: req.user._id } }
      });
    } else if (req.body.feedback?.result === 'fail') {
      await Application.findByIdAndUpdate(interview.application._id, {
        status : 'rejected',
        $push  : { timeline: { status: 'rejected', note: `Did not clear ${interview.roundName}`, updatedBy: req.user._id } }
      });
    }

    return res.json(interview);
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/interviews/:id/cancel
// ─────────────────────────────────────────────────────────────────────────────
exports.cancelInterview = async (req, res) => {
  try {
    const interview = await Interview.findById(req.params.id)
      .populate('student', 'name email')
      .populate('job',     'title');

    if (!interview) return res.status(404).json({ message: 'Interview not found' });

    interview.status       = 'cancelled';
    interview.cancelReason = req.body.reason;
    await interview.save();

    try {
      await sendEmail({
        to      : interview.student.email,
        subject : `Interview Cancelled — ${interview.job.title}`,
        html    : `<h2>Interview Cancelled</h2>
                   <p>Your ${interview.roundName} for <strong>${interview.job.title}</strong> has been cancelled.</p>
                   ${req.body.reason ? `<p><strong>Reason:</strong> ${req.body.reason}</p>` : ''}
                   <p>Please check the portal for rescheduling updates.</p>`
      });
    } catch (emailErr) {
      console.error('Cancel email failed (non-fatal):', emailErr.message);
    }

    safeEmit(req, interview.student._id.toString(), 'interview-cancelled', { interviewId: interview._id });

    return res.json({ message: 'Interview cancelled', interview });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/interviews/:id/reschedule
// ─────────────────────────────────────────────────────────────────────────────
exports.rescheduleInterview = async (req, res) => {
  try {
    const { scheduledAt, reason } = req.body;
    const interview = await Interview.findById(req.params.id)
      .populate('student', 'name email')
      .populate('job',     'title');

    if (!interview) return res.status(404).json({ message: 'Not found' });

    interview.scheduledAt = scheduledAt;
    interview.status      = 'rescheduled';
    interview.timeline    = interview.timeline || [];
    await interview.save();

    try {
      await sendEmail({
        to      : interview.student.email,
        subject : `Interview Rescheduled — ${interview.job.title}`,
        html    : `<h2>Interview Rescheduled</h2>
                   <p>Your ${interview.roundName} has been rescheduled to
                   <strong>${new Date(scheduledAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST</strong>.</p>
                   ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ''}`
      });
    } catch (emailErr) {
      console.error('Reschedule email failed (non-fatal):', emailErr.message);
    }

    return res.json(interview);
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/interviews/all  (admin)
// ─────────────────────────────────────────────────────────────────────────────
exports.getAllInterviews = async (req, res) => {
  try {
    const { status, page = 1, limit = 30 } = req.query;
    const query = status ? { status } : {};

    const total      = await Interview.countDocuments(query);
    const interviews = await Interview.find(query)
      .populate('student', 'name email')
      .populate('job',     'title')
      .populate('company', 'name companyName')
      .sort({ scheduledAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    return res.json({ interviews, total, pages: Math.ceil(total / limit) });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};