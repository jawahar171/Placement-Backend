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
        await cloudinary.uploader.destroy(student.resumePublicId, { resource_type: 'auto' });
      } catch (e) {
        console.log('Old resume delete failed (non-critical):', e.message);
      }
    }

    const result = await uploadToCloudinary(req.file.buffer, {
      folder:        'placement/resumes',
      resource_type: 'auto',   // 'auto' detects PDF → serves as application/pdf with public URL
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
    const { department, batch, cgpa, isPlaced, search, page = 1, limit = 20, status } = req.query;

    const query = { role: 'student' };

    // Admins can filter by active/inactive; default for non-admins is active only
    if (req.user.role === 'admin') {
      if (status === 'inactive') query.isActive = false;
      else if (status === 'active') query.isActive = true;
      // if status not provided, admin sees ALL students (active + inactive)
    } else {
      query.isActive = true;
    }

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
// ── Get signed resume URL ──────────────────────────────────────────────────
// Generates a fresh Cloudinary signed URL from the stored resumeUrl public_id.
// This works for ALL existing resumes regardless of resource_type (raw or auto).
exports.getResumeSignedUrl = async (req, res) => {
  try {
    const { cloudinary } = require('../config/cloudinary');

    // Determine whose resume to sign
    let student;
    if (req.params.id) {
      // Admin or company viewing another student's resume
      student = await User.findById(req.params.id).select('resumeUrl resumePublicId role');
    } else {
      // Student viewing their own resume
      student = await User.findById(req.user._id).select('resumeUrl resumePublicId role');
    }

    if (!student || student.role !== 'student') {
      return res.status(404).json({ message: 'Student not found' });
    }
    if (!student.resumeUrl) {
      return res.status(404).json({ message: 'No resume uploaded' });
    }

    // Extract public_id from stored URL if resumePublicId not stored
    let publicId = student.resumePublicId;
    if (!publicId) {
      // Extract everything after /upload/ (skip version prefix like v1234/)
      const match = student.resumeUrl.match(/\/upload\/(?:[^/]+\/)?(?:v\d+\/)?(.+)$/);
      if (!match) return res.status(400).json({ message: 'Cannot parse resume URL' });
      // Remove query string if present
      publicId = match[1].split('?')[0];
    }

    // Generate a signed URL — the public_id already includes the file extension
    // so we do NOT append format again (avoids .pdf.pdf double extension bug)
    const signedUrl = cloudinary.url(publicId, {
      resource_type: 'raw',
      type:          'upload',
      sign_url:      true,
      secure:        true,
    });

    res.json({ url: signedUrl });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── View resume via redirect (GET /students/resume/view?token=...) ─────────
// Accepts JWT via query param so plain <a href> navigation works.
// Issues a 302 → signed Cloudinary URL. The browser follows it natively —
// no popup blocker, no chrome-error frame, no async/await issues.
exports.viewResume = async (req, res) => {
  try {
    const jwt = require('jsonwebtoken');
    const { cloudinary } = require('../config/cloudinary');

    // Accept token from query param (plain <a href> can't set headers)
    const token = req.query.token;
    if (!token) return res.status(401).send('No token provided');

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      return res.status(401).send('Invalid token');
    }

    // Determine which student's resume to serve
    const studentId = req.query.studentId || decoded.id;
    const student = await User.findById(studentId).select('resumeUrl resumePublicId role');

    if (!student || student.role !== 'student') {
      return res.status(404).send('Student not found');
    }
    if (!student.resumeUrl) {
      return res.status(404).send('No resume uploaded');
    }

    // Build public_id from stored URL or resumePublicId field
    let publicId = student.resumePublicId;
    if (!publicId) {
      const match = student.resumeUrl.match(/\/upload\/(?:[^/]+\/)?(?:v\d+\/)?(.+)$/);
      if (!match) return res.status(400).send('Cannot parse resume URL');
      publicId = match[1].split('?')[0];
    }

    // Generate signed URL
    const signedUrl = cloudinary.url(publicId, {
      resource_type: 'raw',
      type:          'upload',
      sign_url:      true,
      secure:        true,
    });

    // 302 redirect — browser follows this natively, no frame issues
    return res.redirect(302, signedUrl);
  } catch (err) {
    res.status(500).send(err.message);
  }
};