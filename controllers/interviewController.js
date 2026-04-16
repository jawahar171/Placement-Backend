const Interview = require('../models/Interview');
const Application = require('../models/Application');
const { sendEmail, emailTemplates } = require('../utils/email');
const { createNotification } = require('../utils/notifications');

exports.scheduleInterview = async (req, res) => {
  try {
    const {
      applicationId, scheduledAt, format, round, roundName,
      venue, duration, interviewers, agenda,
      meetingUrl   // ← company pastes a Google Meet / Zoom link directly
    } = req.body;

    const application = await Application.findById(applicationId)
      .populate('student', 'name email')
      .populate('job', 'title');

    if (!application) return res.status(404).json({ message: 'Application not found' });

    // Validate that virtual interviews have a meeting link
    if (format === 'virtual' && !meetingUrl) {
      return res.status(400).json({ message: 'A meeting link is required for virtual interviews' });
    }

    const interview = await Interview.create({
      application: applicationId,
      student: application.student._id,
      company: req.user._id,
      job: application.job._id,
      scheduledAt, format, round, roundName,
      duration: duration || 60,
      venue, interviewers, agenda,
      meetingUrl: format === 'virtual' ? meetingUrl : null,
      meetingRoomName: null
    });

    application.status = 'interview_scheduled';
    application.timeline.push({
      status: 'interview_scheduled',
      note: `${roundName} scheduled for ${new Date(scheduledAt).toLocaleString()}`,
      updatedBy: req.user._id
    });
    await application.save();

    const companyName = req.user.companyName || 'Company';
    const { subject, html } = emailTemplates.interviewScheduled(
      application.student.name,
      application.job.title,
      companyName,
      scheduledAt, format, meetingUrl, venue, roundName
    );
    await sendEmail({ to: application.student.email, subject, html });

    // FIX: use req.app.get('io') — req.io was never set, causing a crash
    // that returned 500 even though the interview was already saved to DB.
    const io = req.app.get('io');

    await createNotification(io, {
      recipient: application.student._id,
      type: 'interview_scheduled',
      title: 'Interview Scheduled',
      message: `${roundName} for ${application.job.title} on ${new Date(scheduledAt).toLocaleDateString()}`,
      link: `/student/interviews`
    });

    if (io) {
      io.to(application.student._id.toString()).emit('interview-scheduled', { interview });
    }

    const populated = await Interview.findById(interview._id)
      .populate('student', 'name email department cgpa rollNumber skills resumeUrl')
      .populate('job', 'title')
      .populate('company', 'name companyName');

    res.status(201).json(populated);
  } catch (err) {
    console.error('scheduleInterview error:', err.message);
    res.status(500).json({ message: err.message });
  }
};

exports.getMyInterviews = async (req, res) => {
  try {
    const query = req.user.role === 'student'
      ? { student: req.user._id }
      : { company: req.user._id };

    const interviews = await Interview.find(query)
      .populate('student', 'name email avatar department cgpa rollNumber skills resumeUrl')
      .populate('job', 'title type')
      .populate('company', 'name companyName logoUrl')
      .populate('application', 'status')
      .sort({ scheduledAt: 1 });

    res.json(interviews);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getInterviewById = async (req, res) => {
  try {
    const interview = await Interview.findById(req.params.id)
      .populate('student', 'name email department cgpa rollNumber skills resumeUrl')
      .populate('job', 'title type package')
      .populate('company', 'name companyName logoUrl industry')
      .populate('application');

    if (!interview) return res.status(404).json({ message: 'Interview not found' });
    res.json(interview);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.submitFeedback = async (req, res) => {
  try {
    const interview = await Interview.findById(req.params.id)
      .populate('application');

    if (!interview) return res.status(404).json({ message: 'Interview not found' });
    if (interview.company.toString() !== req.user._id.toString())
      return res.status(403).json({ message: 'Unauthorized' });

    interview.feedback = req.body.feedback;
    interview.status = 'completed';
    await interview.save();

    if (req.body.feedback?.result === 'pass') {
      await Application.findByIdAndUpdate(interview.application._id, {
        status: 'interview_completed',
        $push: {
          timeline: {
            status: 'interview_completed',
            note: `${interview.roundName} cleared`,
            updatedBy: req.user._id
          }
        }
      });
    } else if (req.body.feedback?.result === 'fail') {
      await Application.findByIdAndUpdate(interview.application._id, {
        status: 'rejected',
        $push: {
          timeline: {
            status: 'rejected',
            note: `Did not clear ${interview.roundName}`,
            updatedBy: req.user._id
          }
        }
      });
    }

    res.json(interview);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.cancelInterview = async (req, res) => {
  try {
    const interview = await Interview.findById(req.params.id)
      .populate('student', 'name email')
      .populate('job', 'title');

    if (!interview) return res.status(404).json({ message: 'Interview not found' });

    interview.status = 'cancelled';
    interview.cancelReason = req.body.reason;
    await interview.save();

    await sendEmail({
      to: interview.student.email,
      subject: `Interview Cancelled — ${interview.job.title}`,
      html: `<h2>Interview Cancelled</h2><p>Your ${interview.roundName} for <strong>${interview.job.title}</strong> has been cancelled.</p>${req.body.reason ? `<p><strong>Reason:</strong> ${req.body.reason}</p>` : ''}<p>Please check the portal for rescheduling updates.</p>`
    });

    // FIX: use req.app.get('io') instead of req.io
    const io = req.app.get('io');
    if (io) {
      io.to(interview.student._id.toString()).emit('interview-cancelled', { interviewId: interview._id });
    }

    res.json({ message: 'Interview cancelled', interview });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.rescheduleInterview = async (req, res) => {
  try {
    const { scheduledAt, reason } = req.body;
    const interview = await Interview.findById(req.params.id)
      .populate('student', 'name email')
      .populate('job', 'title');

    if (!interview) return res.status(404).json({ message: 'Not found' });

    interview.scheduledAt = scheduledAt;
    interview.status = 'rescheduled';
    interview.timeline = interview.timeline || [];
    await interview.save();

    await sendEmail({
      to: interview.student.email,
      subject: `Interview Rescheduled — ${interview.job.title}`,
      html: `<h2>Interview Rescheduled</h2><p>Your ${interview.roundName} has been rescheduled to <strong>${new Date(scheduledAt).toLocaleString()}</strong>.</p>${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ''}`
    });

    res.json(interview);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getAllInterviews = async (req, res) => {
  try {
    const { status, page = 1, limit = 30 } = req.query;
    const query = status ? { status } : {};

    const total = await Interview.countDocuments(query);
    const interviews = await Interview.find(query)
      .populate('student', 'name email')
      .populate('job', 'title')
      .populate('company', 'name companyName')
      .sort({ scheduledAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    res.json({ interviews, total, pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};