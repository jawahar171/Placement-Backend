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
      resource_type: 'auto',
      public_id:     `resume_${req.user._id}_${Date.now()}`,
      format:        req.file.originalname.split('.').pop(),
      access_mode:   'public',   // explicitly set public so URL is always accessible
      type:          'upload',
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

// ── View/download resume proxy ─────────────────────────────────────────────
// Streams resume bytes from Cloudinary through our server.
// New uploads use access_mode:'public' so they're always accessible.
// Uses axios to fetch and stream — avoids any browser cross-origin issues.
exports.viewResume = async (req, res) => {
  try {
    const jwt   = require('jsonwebtoken');
    const axios = require('axios');

    // 1. Verify JWT — accept from Authorization header or query param
    let token = req.query.token;
    if (!token && req.headers.authorization?.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }
    if (!token) return res.status(401).send('No token provided');
    let decoded;
    try { decoded = jwt.verify(token, process.env.JWT_SECRET); }
    catch { return res.status(401).send('Invalid or expired token'); }

    // 2. Find student
    const studentId = req.params.id || req.query.studentId || decoded.id;
    const student   = await User.findById(studentId).select('resumeUrl role');
    if (!student || student.role !== 'student') return res.status(404).send('Student not found');
    if (!student.resumeUrl) return res.status(404).send('No resume uploaded');

    // 3. Fetch the resume bytes from Cloudinary using server-side request
    //    Server-side requests bypass browser CORS and access control restrictions
    const fileRes = await axios.get(student.resumeUrl, {
      responseType: 'stream',
      timeout:      20000,
      headers:      { 'User-Agent': 'Mozilla/5.0' },
    });

    // 4. Stream bytes to browser from our domain
    const fmt = (student.resumeUrl.split('?')[0].split('.').pop() || 'pdf').toLowerCase();
    res.setHeader('Content-Disposition', `attachment; filename="resume.${fmt}"`);
    res.setHeader('Content-Type', fileRes.headers['content-type'] || 'application/pdf');
    res.setHeader('Cache-Control', 'private, max-age=300');
    fileRes.data.pipe(res);

  } catch (err) {
    console.error('viewResume error:', err.message);
    res.status(500).send('Could not load resume: ' + err.message);
  }
};


// ── Migrate resume from raw → auto type ───────────────────────────────────
// Re-uploads the stored raw Cloudinary file as resource_type:'auto'
// so it gets a /image/upload/ URL that browsers can open directly.
// Called once per student — subsequent uploads already use 'auto' type.
exports.migrateResume = async (req, res) => {
  try {
    const { cloudinary } = require('../config/cloudinary');

    const student = await User.findById(req.user._id).select('resumeUrl resumePublicId');
    if (!student?.resumeUrl) return res.status(404).json({ message: 'No resume found' });

    // Already migrated (auto type uses /image/upload/ path)
    if (student.resumeUrl.includes('/image/upload/')) {
      return res.json({ resumeUrl: student.resumeUrl, migrated: false });
    }

    // Re-upload from the existing URL with resource_type:'auto'
    const result = await cloudinary.uploader.upload(student.resumeUrl, {
      resource_type: 'auto',
      folder:        'placement/resumes',
      use_filename:  false,
      overwrite:     false,
    });

    // Save the new accessible URL
    const updated = await User.findByIdAndUpdate(
      req.user._id,
      { resumeUrl: result.secure_url, resumePublicId: result.public_id },
      { new: true }
    ).select('-password');

    res.json({ resumeUrl: result.secure_url, migrated: true, student: updated });
  } catch (err) {
    console.error('migrateResume error:', err.message);
    res.status(500).json({ message: err.message });
  }
};

// ── Migrate any student's resume (admin/company) ──────────────────────────
exports.migrateStudentResume = async (req, res) => {
  try {
    const { cloudinary } = require('../config/cloudinary');

    const student = await User.findById(req.params.id).select('resumeUrl resumePublicId role');
    if (!student || student.role !== 'student')
      return res.status(404).json({ message: 'Student not found' });
    if (!student?.resumeUrl)
      return res.status(404).json({ message: 'No resume found' });

    if (student.resumeUrl.includes('/image/upload/')) {
      return res.json({ resumeUrl: student.resumeUrl, migrated: false });
    }

    const result = await cloudinary.uploader.upload(student.resumeUrl, {
      resource_type: 'auto',
      folder:        'placement/resumes',
      use_filename:  false,
      overwrite:     false,
    });

    const updated = await User.findByIdAndUpdate(
      req.params.id,
      { resumeUrl: result.secure_url, resumePublicId: result.public_id },
      { new: true }
    ).select('-password');

    res.json({ resumeUrl: result.secure_url, migrated: true, student: updated });
  } catch (err) {
    console.error('migrateStudentResume error:', err.message);
    res.status(500).json({ message: err.message });
  }
};

// ── Upload-migrate: re-upload a student's resume (admin/company) ──────────
// Receives the resume file and saves it as resource_type:'auto' for the student.
// Used when admin/company views an old raw-type resume that can't be opened.
exports.uploadMigrateResume = async (req, res) => {
  try {
    const { cloudinary, uploadToCloudinary } = require('../config/cloudinary');

    const student = await User.findById(req.params.id).select('resumeUrl resumePublicId role');
    if (!student || student.role !== 'student')
      return res.status(404).json({ message: 'Student not found' });
    if (!req.file) return res.status(400).json({ message: 'No file received' });

    // Delete old raw resume
    if (student.resumePublicId) {
      try {
        await cloudinary.uploader.destroy(student.resumePublicId, { resource_type: 'raw' });
      } catch (_) {}
    }

    const result = await uploadToCloudinary(req.file.buffer, {
      folder:        'placement/resumes',
      resource_type: 'auto',
      public_id:     `resume_${req.params.id}_${Date.now()}`,
    });

    const updated = await User.findByIdAndUpdate(
      req.params.id,
      { resumeUrl: result.secure_url, resumePublicId: result.public_id },
      { new: true }
    ).select('-password');

    res.json({ resumeUrl: result.secure_url, student: updated });
  } catch (err) {
    console.error('uploadMigrateResume error:', err.message);
    res.status(500).json({ message: err.message });
  }
};