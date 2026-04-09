const User        = require('../models/User');
const Application = require('../models/Application');
const Interview   = require('../models/Interview');

// ── Get profile ────────────────────────────────────────────────────────────
exports.getProfile = async (req, res) => {
  try {
    const student = await User.findById(req.user._id).select('-password');
    if (!student || student.role !== 'student') {
      return res.status(404).json({ message: 'Student not found' });
    }
    res.json(student);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── Update profile ─────────────────────────────────────────────────────────
exports.updateProfile = async (req, res) => {
  try {
    const {
      name, phone, address, linkedin, github,
      skills, cgpa, department, batch,
      rollNumber, profilePhoto, website, description
    } = req.body;

    // Build update using FLAT field names that match the User model
    const update = {
      name,
      phone,
      address,
      linkedin,
      github,
      skills,
      cgpa,
      department,
      batch,
      rollNumber,
      profilePhoto,
      website,
      description,
    };

    // Remove undefined values so we don't overwrite with null
    Object.keys(update).forEach(k => update[k] === undefined && delete update[k]);

    const student = await User.findByIdAndUpdate(
      req.user._id,
      update,
      { new: true, runValidators: true }
    ).select('-password');

    res.json(student);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── Upload resume ──────────────────────────────────────────────────────────
exports.uploadResume = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

    const { cloudinary, uploadToCloudinary } = require('../config/cloudinary');

    // Delete old resume from Cloudinary if exists
    const student = await User.findById(req.user._id);
    if (student.resumePublicId) {
      try {
        await cloudinary.uploader.destroy(student.resumePublicId, { resource_type: 'raw' });
      } catch (e) {
        console.log('Old resume delete failed (non-critical):', e.message);
      }
    }

    const result = await uploadToCloudinary(req.file.buffer, {
      folder:        'placement/resumes',
      resource_type: 'raw',
      public_id:     `resume_${req.user._id}_${Date.now()}`,
      format:        req.file.originalname.split('.').pop(),
    });

    const updated = await User.findByIdAndUpdate(
      req.user._id,
      {
        resumeUrl:      result.secure_url,
        resumePublicId: result.public_id,
      },
      { new: true }
    ).select('-password');

    res.json({ message: 'Resume uploaded', resumeUrl: result.secure_url, student: updated });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── Update academic records ────────────────────────────────────────────────
exports.updateAcademicRecords = async (req, res) => {
  try {
    const { cgpa, tenthPercentage, twelfthPercentage, backlogs } = req.body;

    const update = {};
    if (cgpa              !== undefined) update.cgpa              = cgpa;
    if (tenthPercentage   !== undefined) update.tenthPercentage   = tenthPercentage;
    if (twelfthPercentage !== undefined) update.twelfthPercentage = twelfthPercentage;
    if (backlogs          !== undefined) update.backlogs          = backlogs;

    const student = await User.findByIdAndUpdate(
      req.user._id,
      update,
      { new: true, runValidators: true }
    ).select('-password');

    res.json(student);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── Student dashboard ──────────────────────────────────────────────────────
exports.getDashboard = async (req, res) => {
  try {
    const studentId = req.user._id;

    const [
      totalApplications,
      shortlisted,
      interviewCount,
      offers,
      recentApplications,
    ] = await Promise.all([
      Application.countDocuments({ student: studentId }),
      Application.countDocuments({ student: studentId, status: 'shortlisted' }),
      Interview.countDocuments({ student: studentId }),
      Application.countDocuments({ student: studentId, status: { $in: ['offered', 'offer_accepted'] } }),
      Application.find({ student: studentId })
        .populate('job',     'title type package stipend')
        .populate('company', 'name companyName logoUrl')
        .sort({ createdAt: -1 })
        .limit(5),
    ]);

    const upcomingInterviews = await Interview.find({
      student:     studentId,
      status:      'scheduled',
      scheduledAt: { $gte: new Date() },
    })
      .populate('job',     'title')
      .populate('company', 'name companyName logoUrl')
      .sort({ scheduledAt: 1 })
      .limit(3);

    res.json({
      stats: {
        totalApplications,
        shortlisted,
        interviews: interviewCount,
        offers,
      },
      recentApplications,
      upcomingInterviews,
      profile: req.user,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── Get all students (admin / company) ────────────────────────────────────
exports.getAllStudents = async (req, res) => {
  try {
    const { department, batch, cgpa, isPlaced, search, page = 1, limit = 20 } = req.query;

    const query = { role: 'student', isActive: true };

    if (department) query.department           = department;
    if (batch)      query.batch                = batch;
    if (cgpa)       query.cgpa                 = { $gte: parseFloat(cgpa) };
    if (isPlaced !== undefined) query.isPlaced = isPlaced === 'true';

    if (search) {
      query.$or = [
        { name:       { $regex: search, $options: 'i' } },
        { email:      { $regex: search, $options: 'i' } },
        { rollNumber: { $regex: search, $options: 'i' } },
      ];
    }

    const total    = await User.countDocuments(query);
    const students = await User.find(query)
      .select('-password')
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .sort({ cgpa: -1 });

    res.json({
      students,
      total,
      pages: Math.ceil(total / limit),
      page:  parseInt(page),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── Get student by ID ──────────────────────────────────────────────────────
exports.getStudentById = async (req, res) => {
  try {
    const student = await User.findById(req.params.id).select('-password');
    if (!student || student.role !== 'student') {
      return res.status(404).json({ message: 'Student not found' });
    }
    res.json(student);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};