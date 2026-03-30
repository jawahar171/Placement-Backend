const User = require('../models/User');
const Application = require('../models/Application');
const Interview = require('../models/Interview');

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

exports.updateProfile = async (req, res) => {
  try {
    const {
      name, phone, address, linkedIn, github, portfolio,
      skills, cgpa, tenthPercentage, twelfthPercentage,
      achievements, certifications, department, batch
    } = req.body;

    const update = {
      name,
      'studentProfile.phone': phone,
      'studentProfile.address': address,
      'studentProfile.linkedIn': linkedIn,
      'studentProfile.github': github,
      'studentProfile.portfolio': portfolio,
      'studentProfile.skills': skills,
      'studentProfile.cgpa': cgpa,
      'studentProfile.tenthPercentage': tenthPercentage,
      'studentProfile.twelfthPercentage': twelfthPercentage,
      'studentProfile.achievements': achievements,
      'studentProfile.certifications': certifications,
      'studentProfile.department': department,
      'studentProfile.batch': batch
    };

    // Remove undefined values
    Object.keys(update).forEach(k => update[k] === undefined && delete update[k]);

    const student = await User.findByIdAndUpdate(req.user._id, update, { new: true }).select('-password');
    res.json(student);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.uploadResume = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

    const { cloudinary, uploadToCloudinary } = require('../config/cloudinary');

    // Delete old resume from Cloudinary if it exists
    const student = await User.findById(req.user._id);
    if (student.studentProfile?.resumePublicId) {
      try {
        await cloudinary.uploader.destroy(student.studentProfile.resumePublicId, { resource_type: 'raw' });
      } catch (e) {
        console.log('Old resume delete failed (non-critical):', e.message);
      }
    }

    // Upload buffer to Cloudinary
    const result = await uploadToCloudinary(req.file.buffer, {
      folder: 'placement/resumes',
      resource_type: 'raw',
      public_id: `resume_${req.user._id}_${Date.now()}`,
      format: req.file.originalname.split('.').pop(),
    });

    const updated = await User.findByIdAndUpdate(req.user._id, {
      'studentProfile.resumeUrl':      result.secure_url,
      'studentProfile.resumePublicId': result.public_id,
    }, { new: true }).select('-password');

    res.json({ message: 'Resume uploaded', resumeUrl: result.secure_url, student: updated });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.updateAcademicRecords = async (req, res) => {
  try {
    const { academicRecords } = req.body;
    const student = await User.findByIdAndUpdate(req.user._id, {
      'studentProfile.academicRecords': academicRecords
    }, { new: true }).select('-password');
    res.json(student);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getDashboard = async (req, res) => {
  try {
    const studentId = req.user._id;

    const [
      totalApplications,
      shortlisted,
      interviews,
      offers,
      recentApplications
    ] = await Promise.all([
      Application.countDocuments({ student: studentId }),
      Application.countDocuments({ student: studentId, status: 'shortlisted' }),
      Interview.countDocuments({ student: studentId }),
      Application.countDocuments({ student: studentId, status: { $in: ['offered', 'offer_accepted'] } }),
      Application.find({ student: studentId })
        .populate('job', 'title type package stipend')
        .populate('company', 'companyProfile.companyName companyProfile.logoUrl')
        .sort({ createdAt: -1 })
        .limit(5)
    ]);

    const upcomingInterviews = await Interview.find({
      student: studentId,
      status: 'scheduled',
      scheduledAt: { $gte: new Date() }
    })
      .populate('job', 'title')
      .populate('company', 'companyProfile.companyName companyProfile.logoUrl')
      .sort({ scheduledAt: 1 })
      .limit(3);

    res.json({
      stats: { totalApplications, shortlisted, interviews, offers },
      recentApplications,
      upcomingInterviews,
      profile: req.user
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getAllStudents = async (req, res) => {
  try {
    const { department, batch, cgpa, status, search, page = 1, limit = 20 } = req.query;
    const query = { role: 'student', isActive: true };

    if (department) query['studentProfile.department'] = department;
    if (batch) query['studentProfile.batch'] = batch;
    if (cgpa) query['studentProfile.cgpa'] = { $gte: parseFloat(cgpa) };
    if (status) query['studentProfile.placementStatus'] = status;
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { 'studentProfile.rollNumber': { $regex: search, $options: 'i' } }
      ];
    }

    const total = await User.countDocuments(query);
    const students = await User.find(query)
      .select('-password')
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .sort({ 'studentProfile.cgpa': -1 });

    res.json({ students, total, pages: Math.ceil(total / limit), page: parseInt(page) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

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