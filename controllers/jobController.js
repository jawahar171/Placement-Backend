const Job  = require('../models/Job');
const User = require('../models/User');

// ── Create job ─────────────────────────────────────────────────────────────
exports.createJob = async (req, res) => {
  try {
    const job = await Job.create({ ...req.body, company: req.user._id });
    res.status(201).json(job);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── Get all jobs ───────────────────────────────────────────────────────────
exports.getAllJobs = async (req, res) => {
  try {
    const {
      type, status = 'active', search, department,
      minPackage, page = 1, limit = 20, sortBy = 'createdAt'
    } = req.query;

    const query = { status };

    if (type)       query.type    = type;
    if (minPackage) query.package = { $gte: parseFloat(minPackage) };
    if (search) {
      query.$or = [
        { title:       { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { skills:      { $regex: search, $options: 'i' } },
      ];
    }
    if (department) query['eligibility.allowedDepartments'] = { $in: [department] };

    const total = await Job.countDocuments(query);
    const jobs  = await Job.find(query)
      .populate('company', 'name companyName logoUrl industry website')
      .sort({ [sortBy]: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    res.json({ jobs, total, pages: Math.ceil(total / limit), page: parseInt(page) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── Get job by ID ──────────────────────────────────────────────────────────
exports.getJobById = async (req, res) => {
  try {
    const job = await Job.findById(req.params.id)
      .populate('company', 'name companyName email logoUrl industry website')
      .populate('placementDrive', 'title startDate endDate');
    if (!job) return res.status(404).json({ message: 'Job not found' });
    res.json(job);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── Get company jobs ───────────────────────────────────────────────────────
exports.getCompanyJobs = async (req, res) => {
  try {
    const jobs = await Job.find({ company: req.user._id }).sort({ createdAt: -1 });
    res.json(jobs);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── Update job ─────────────────────────────────────────────────────────────
exports.updateJob = async (req, res) => {
  try {
    const job = await Job.findOne({ _id: req.params.id, company: req.user._id });
    if (!job) return res.status(404).json({ message: 'Job not found or unauthorized' });
    Object.assign(job, req.body);
    await job.save();
    res.json(job);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── Delete job ─────────────────────────────────────────────────────────────
exports.deleteJob = async (req, res) => {
  try {
    const job = await Job.findOneAndDelete({ _id: req.params.id, company: req.user._id });
    if (!job) return res.status(404).json({ message: 'Job not found or unauthorized' });
    res.json({ message: 'Job deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── Check eligibility ──────────────────────────────────────────────────────
exports.checkEligibility = async (req, res) => {
  try {
    const job = await Job.findById(req.params.id);
    if (!job) return res.status(404).json({ message: 'Job not found' });

    // Use flat fields directly from User model — no studentProfile nesting
    const student = req.user;
    const cgpa         = student.cgpa         ?? 0;
    const backlogs     = student.backlogs      ?? 0;
    const department   = student.department    ?? '';
    const batch        = student.batch         ?? '';

    const issues = [];

    if (job.eligibility?.minCGPA && cgpa < job.eligibility.minCGPA) {
      issues.push(`Minimum CGPA required: ${job.eligibility.minCGPA} (yours: ${cgpa})`);
    }
    if (job.eligibility?.maxBacklogs !== undefined && backlogs > job.eligibility.maxBacklogs) {
      issues.push(`Maximum backlogs allowed: ${job.eligibility.maxBacklogs} (yours: ${backlogs})`);
    }
    if (job.eligibility?.allowedDepartments?.length &&
        !job.eligibility.allowedDepartments.includes(department)) {
      issues.push(`Open for departments: ${job.eligibility.allowedDepartments.join(', ')}`);
    }
    if (job.eligibility?.allowedBatches?.length &&
        !job.eligibility.allowedBatches.includes(batch)) {
      issues.push(`Open for batches: ${job.eligibility.allowedBatches.join(', ')}`);
    }

    res.json({ eligible: issues.length === 0, issues });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};