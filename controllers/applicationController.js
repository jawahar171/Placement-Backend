const Application = require('../models/Application');
const Job = require('../models/Job');
const User = require('../models/User');
const { sendEmail, emailTemplates } = require('../utils/email');
const { createNotification } = require('../utils/notifications');

exports.applyForJob = async (req, res) => {
  try {
    const job = await Job.findById(req.params.jobId).populate('company');
    if (!job) return res.status(404).json({ message: 'Job not found' });
    if (job.status !== 'active') return res.status(400).json({ message: 'This job is no longer accepting applications' });

    const deadline = new Date(job.applicationDeadline);
    if (new Date() > deadline) return res.status(400).json({ message: 'Application deadline has passed' });

    const existing = await Application.findOne({ student: req.user._id, job: job._id });
    if (existing) return res.status(400).json({ message: 'You have already applied for this job' });

    const student = req.user;
    if (!student.studentProfile?.resumeUrl) {
      return res.status(400).json({ message: 'Please upload your resume before applying' });
    }

    const application = await Application.create({
      student: req.user._id,
      job: job._id,
      company: job.company._id,
      coverLetter: req.body.coverLetter,
      resumeUrl: student.studentProfile.resumeUrl,
      timeline: [{ status: 'submitted', note: 'Application submitted successfully', updatedBy: req.user._id }]
    });

    // Increment job application count
    await Job.findByIdAndUpdate(job._id, { $inc: { applicationCount: 1 } });

    // Send email to student
    const { subject, html } = emailTemplates.applicationSubmitted(
      student.name, job.title, job.company.companyProfile?.companyName || 'Company'
    );
    await sendEmail({ to: student.email, subject, html });

    // Notify company
    await createNotification(req.io, {
      recipient: job.company._id,
      type: 'application_submitted',
      title: 'New Application Received',
      message: `${student.name} applied for ${job.title}`,
      link: `/company/applications/${application._id}`
    });

    const populated = await Application.findById(application._id)
      .populate('job', 'title type package')
      .populate('company', 'companyProfile.companyName');

    res.status(201).json(populated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getMyApplications = async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const query = { student: req.user._id };
    if (status) query.status = status;

    const total = await Application.countDocuments(query);
    const applications = await Application.find(query)
      .populate('job', 'title type package stipend location skills applicationDeadline')
      .populate('company', 'companyProfile.companyName companyProfile.logoUrl companyProfile.industry')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    res.json({ applications, total, pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getApplicationById = async (req, res) => {
  try {
    const application = await Application.findById(req.params.id)
      .populate('student', '-password')
      .populate('job')
      .populate('company', 'companyProfile');

    if (!application) return res.status(404).json({ message: 'Application not found' });

    const isOwner = application.student._id.toString() === req.user._id.toString();
    const isCompany = application.company._id.toString() === req.user._id.toString();
    const isAdmin = req.user.role === 'admin';

    if (!isOwner && !isCompany && !isAdmin) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    res.json(application);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getCompanyApplications = async (req, res) => {
  try {
    const { status, jobId, search, isStarred, page = 1, limit = 20 } = req.query;
    const query = { company: req.user._id };

    if (status) query.status = status;
    if (jobId) query.job = jobId;
    if (isStarred === 'true') query.isStarred = true;

    const total = await Application.countDocuments(query);
    let applications = await Application.find(query)
      .populate('student', 'name email studentProfile avatar')
      .populate('job', 'title type package stipend')
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

exports.updateApplicationStatus = async (req, res) => {
  try {
    const { status, feedback, offeredPackage, offeredRole, offerDeadline } = req.body;

    const application = await Application.findById(req.params.id)
      .populate('student', 'name email')
      .populate('job', 'title');

    if (!application) return res.status(404).json({ message: 'Application not found' });

    const isCompany = application.company.toString() === req.user._id.toString();
    const isAdmin = req.user.role === 'admin';
    if (!isCompany && !isAdmin) return res.status(403).json({ message: 'Unauthorized' });

    application.status = status;
    if (feedback) application.companyFeedback = feedback;
    if (offeredPackage) application.offeredPackage = offeredPackage;
    if (offeredRole) application.offeredRole = offeredRole;
    if (offerDeadline) application.offerDeadline = offerDeadline;

    application.timeline.push({
      status,
      note: feedback || `Status updated to ${status}`,
      updatedBy: req.user._id
    });

    await application.save();

    // If offered, update job offer count
    if (status === 'offered') {
      await Job.findByIdAndUpdate(application.job._id, { $inc: { offerCount: 1 } });

      // If accepted, mark student as placed
      const { subject, html } = emailTemplates.offerLetter(
        application.student.name,
        application.job.title,
        req.user.companyProfile?.companyName || 'Company',
        offeredPackage,
        offerDeadline
      );
      await sendEmail({ to: application.student.email, subject, html });
    }

    // Email notification
    if (status !== 'submitted') {
      const { subject, html } = emailTemplates.applicationStatusUpdate(
        application.student.name,
        application.job.title,
        status,
        feedback
      );
      await sendEmail({ to: application.student.email, subject, html });
    }

    // Real-time notification
    await createNotification(req.io, {
      recipient: application.student._id,
      type: status === 'offered' ? 'offer_received' : 'application_reviewed',
      title: `Application ${status.replace(/_/g, ' ')}`,
      message: `Your application for ${application.job.title} has been ${status.replace(/_/g, ' ')}`,
      link: `/student/applications/${application._id}`
    });

    // Socket emit
    req.io.to(application.student._id.toString()).emit('application-update', {
      applicationId: application._id, status
    });

    res.json(application);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.acceptOffer = async (req, res) => {
  try {
    const application = await Application.findById(req.params.id)
      .populate('job', 'title')
      .populate('company', 'companyProfile.companyName');

    if (!application) return res.status(404).json({ message: 'Not found' });
    if (application.student.toString() !== req.user._id.toString())
      return res.status(403).json({ message: 'Unauthorized' });
    if (application.status !== 'offered')
      return res.status(400).json({ message: 'No offer to accept' });

    application.status = 'offer_accepted';
    application.timeline.push({ status: 'offer_accepted', note: 'Offer accepted by student', updatedBy: req.user._id });
    await application.save();

    // Mark student as placed
    await User.findByIdAndUpdate(req.user._id, {
      'studentProfile.placementStatus': 'placed',
      'studentProfile.offeredCompany': application.company.companyProfile?.companyName,
      'studentProfile.offeredRole': application.offeredRole,
      'studentProfile.offeredPackage': application.offeredPackage,
      'studentProfile.offerAcceptedAt': new Date()
    });

    res.json({ message: 'Offer accepted successfully', application });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.withdrawApplication = async (req, res) => {
  try {
    const application = await Application.findById(req.params.id);
    if (!application) return res.status(404).json({ message: 'Not found' });
    if (application.student.toString() !== req.user._id.toString())
      return res.status(403).json({ message: 'Unauthorized' });

    application.status = 'withdrawn';
    application.timeline.push({ status: 'withdrawn', note: 'Application withdrawn by student', updatedBy: req.user._id });
    await application.save();
    res.json({ message: 'Application withdrawn' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

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

exports.getAllApplications = async (req, res) => {
  try {
    const { status, page = 1, limit = 30 } = req.query;
    const query = status ? { status } : {};

    const total = await Application.countDocuments(query);
    const applications = await Application.find(query)
      .populate('student', 'name email studentProfile')
      .populate('job', 'title type package')
      .populate('company', 'companyProfile.companyName')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    res.json({ applications, total, pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
