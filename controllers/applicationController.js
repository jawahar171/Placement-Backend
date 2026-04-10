const Application = require('../models/Application');
const Job         = require('../models/Job');
const User        = require('../models/User');
const { sendEmail, emailTemplates } = require('../utils/email');
const { createNotification }        = require('../utils/notifications');

// ── Apply for job ──────────────────────────────────────────────────────────
exports.applyForJob = async (req, res) => {
  try {
    const job = await Job.findById(req.params.jobId).populate('company');
    if (!job) return res.status(404).json({ message: 'Job not found' });
    if (job.status !== 'active')
      return res.status(400).json({ message: 'This job is no longer accepting applications' });

    if (job.applicationDeadline && new Date() > new Date(job.applicationDeadline))
      return res.status(400).json({ message: 'Application deadline has passed' });

    const existing = await Application.findOne({ student: req.user._id, job: job._id });
    if (existing)
      return res.status(400).json({ message: 'You have already applied for this job' });

    const student = req.user;

    // Use flat resumeUrl field — not studentProfile.resumeUrl
    if (!student.resumeUrl)
      return res.status(400).json({ message: 'Please upload your resume before applying' });

    const application = await Application.create({
      student:     req.user._id,
      job:         job._id,
      company:     job.company._id,
      coverLetter: req.body.coverLetter,
      resumeUrl:   student.resumeUrl,
      timeline: [{
        status:    'submitted',
        note:      'Application submitted successfully',
        updatedBy: req.user._id
      }]
    });

    await Job.findByIdAndUpdate(job._id, { $inc: { applicationCount: 1 } });

    // Email student
    try {
      const { subject, html } = emailTemplates.applicationSubmitted(
        student.name,
        job.title,
        job.company.companyName || job.company.name || 'Company'
      );
      await sendEmail({ to: student.email, subject, html });
    } catch (e) {
      console.log('Email failed (non-critical):', e.message);
    }

    // Notify company
    try {
      await createNotification(req.app.get('io'), {
        recipient: job.company._id,
        type:      'application_submitted',
        title:     'New Application Received',
        message:   `${student.name} applied for ${job.title}`,
        link:      `/company/applications/${application._id}`
      });
    } catch (e) {
      console.log('Notification failed (non-critical):', e.message);
    }

    const populated = await Application.findById(application._id)
      .populate('job',     'title type package')
      .populate('company', 'name companyName logoUrl');

    res.status(201).json(populated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── Get my applications (student) ──────────────────────────────────────────
exports.getMyApplications = async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const query = { student: req.user._id };
    if (status) query.status = status;

    const total        = await Application.countDocuments(query);
    const applications = await Application.find(query)
      .populate('job',     'title type package stipend location skills applicationDeadline')
      .populate('company', 'name companyName logoUrl industry')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    res.json({ applications, total, pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── Get application by ID ──────────────────────────────────────────────────
exports.getApplicationById = async (req, res) => {
  try {
    const application = await Application.findById(req.params.id)
      .populate('student', '-password')
      .populate('job')
      .populate('company', 'name companyName logoUrl');

    if (!application) return res.status(404).json({ message: 'Application not found' });

    const isOwner   = application.student._id.toString() === req.user._id.toString();
    const isCompany = application.company._id.toString() === req.user._id.toString();
    const isAdmin   = req.user.role === 'admin';

    if (!isOwner && !isCompany && !isAdmin)
      return res.status(403).json({ message: 'Unauthorized' });

    res.json(application);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── Get company applications ───────────────────────────────────────────────
exports.getCompanyApplications = async (req, res) => {
  try {
    const { status, jobId, search, isStarred, page = 1, limit = 20 } = req.query;
    const query = { company: req.user._id };

    if (status)            query.status    = status;
    if (jobId)             query.job       = jobId;
    if (isStarred === 'true') query.isStarred = true;

    const total        = await Application.countDocuments(query);
    let applications   = await Application.find(query)
      .populate('student', 'name email cgpa department batch skills resumeUrl')
      .populate('job',     'title type package stipend')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    if (search) {
      applications = applications.filter(a =>
        a.student?.name?.toLowerCase().includes(search.toLowerCase()) ||
        a.student?.email?.toLowerCase().includes(search.toLowerCase())
      );
    }

    res.json({ applications, total, pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── Update application status ──────────────────────────────────────────────
exports.updateApplicationStatus = async (req, res) => {
  try {
    const { status, feedback, offeredPackage, offeredRole, offerDeadline } = req.body;

    const application = await Application.findById(req.params.id)
      .populate('student', 'name email')
      .populate('job',     'title');

    if (!application) return res.status(404).json({ message: 'Application not found' });

    const isCompany = application.company.toString() === req.user._id.toString();
    const isAdmin   = req.user.role === 'admin';
    if (!isCompany && !isAdmin) return res.status(403).json({ message: 'Unauthorized' });

    application.status = status;
    if (feedback)       application.companyFeedback = feedback;
    if (offeredPackage) application.offeredPackage   = offeredPackage;
    if (offeredRole)    application.offeredRole      = offeredRole;
    if (offerDeadline)  application.offerDeadline    = offerDeadline;

    application.timeline.push({
      status,
      note:      feedback || `Status updated to ${status}`,
      updatedBy: req.user._id
    });

    await application.save();

    if (status === 'offered') {
      await Job.findByIdAndUpdate(application.job._id, { $inc: { offerCount: 1 } });
      try {
        const { subject, html } = emailTemplates.offerLetter(
          application.student.name,
          application.job.title,
          req.user.companyName || req.user.name || 'Company',
          offeredPackage,
          offerDeadline
        );
        await sendEmail({ to: application.student.email, subject, html });
      } catch (e) {
        console.log('Offer email failed (non-critical):', e.message);
      }
    }

    if (status !== 'submitted') {
      try {
        const { subject, html } = emailTemplates.applicationStatusUpdate(
          application.student.name,
          application.job.title,
          status,
          feedback
        );
        await sendEmail({ to: application.student.email, subject, html });
      } catch (e) {
        console.log('Status email failed (non-critical):', e.message);
      }
    }

    try {
      await createNotification(req.app.get('io'), {
        recipient: application.student._id,
        type:      status === 'offered' ? 'offer_received' : 'application_reviewed',
        title:     `Application ${status.replace(/_/g, ' ')}`,
        message:   `Your application for ${application.job.title} has been ${status.replace(/_/g, ' ')}`,
        link:      `/student/applications/${application._id}`
      });
      req.app.get('io').to(application.student._id.toString()).emit('application-update', {
        applicationId: application._id, status
      });
    } catch (e) {
      console.log('Notification failed (non-critical):', e.message);
    }

    res.json(application);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── Accept offer (student) ─────────────────────────────────────────────────
exports.acceptOffer = async (req, res) => {
  try {
    const application = await Application.findById(req.params.id)
      .populate('job',     'title')
      .populate('company', 'name companyName');

    if (!application) return res.status(404).json({ message: 'Not found' });
    if (application.student.toString() !== req.user._id.toString())
      return res.status(403).json({ message: 'Unauthorized' });
    if (application.status !== 'offered')
      return res.status(400).json({ message: 'No offer to accept' });

    application.status = 'offer_accepted';
    application.timeline.push({
      status:    'offer_accepted',
      note:      'Offer accepted by student',
      updatedBy: req.user._id
    });
    await application.save();

    // Mark student as placed using FLAT fields
    await User.findByIdAndUpdate(req.user._id, {
      isPlaced:  true,
      placedAt:  new Date().toISOString(),
      ctc:       application.offeredPackage,
    });

    res.json({ message: 'Offer accepted successfully', application });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── Withdraw application ───────────────────────────────────────────────────
exports.withdrawApplication = async (req, res) => {
  try {
    const application = await Application.findById(req.params.id);
    if (!application) return res.status(404).json({ message: 'Not found' });
    if (application.student.toString() !== req.user._id.toString())
      return res.status(403).json({ message: 'Unauthorized' });

    application.status = 'withdrawn';
    application.timeline.push({
      status:    'withdrawn',
      note:      'Application withdrawn by student',
      updatedBy: req.user._id
    });
    await application.save();
    res.json({ message: 'Application withdrawn' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── Toggle star (company) ──────────────────────────────────────────────────
exports.toggleStar = async (req, res) => {
  try {
    const application = await Application.findById(req.params.id);
    if (!application) return res.status(404).json({ message: 'Not found' });
    if (application.company.toString() !== req.user._id.toString())
      return res.status(403).json({ message: 'Unauthorized' });

    application.isStarred = !application.isStarred;
    await application.save();
    res.json({ isStarred: application.isStarred });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── Get all applications (admin) ───────────────────────────────────────────
exports.getAllApplications = async (req, res) => {
  try {
    const { status, page = 1, limit = 30 } = req.query;
    const query = status ? { status } : {};

    const total        = await Application.countDocuments(query);
    const applications = await Application.find(query)
      .populate('student', 'name email cgpa department batch')
      .populate('job',     'title type package')
      .populate('company', 'name companyName logoUrl')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    res.json({ applications, total, pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};