const User = require('../models/User');
const Application = require('../models/Application');
const Job = require('../models/Job');
const Interview = require('../models/Interview');
const PlacementDrive = require('../models/PlacementDrive');

exports.getDashboard = async (req, res) => {
  try {
    const [
      totalStudents, placedStudents, totalCompanies,
      activeJobs, pendingApplications, scheduledInterviews,
      recentDrives
    ] = await Promise.all([
      User.countDocuments({ role: 'student', isActive: true }),
      User.countDocuments({ role: 'student', 'studentProfile.placementStatus': 'placed' }),
      User.countDocuments({ role: 'company', isActive: true }),
      Job.countDocuments({ status: 'active' }),
      Application.countDocuments({ status: 'submitted' }),
      Interview.countDocuments({ status: 'scheduled', scheduledAt: { $gte: new Date() } }),
      PlacementDrive.find().sort({ createdAt: -1 }).limit(5)
        .populate('companies', 'companyProfile.companyName')
    ]);

    const todayInterviews = await Interview.find({
      scheduledAt: {
        $gte: new Date(new Date().setHours(0, 0, 0, 0)),
        $lte: new Date(new Date().setHours(23, 59, 59, 999))
      }
    })
      .populate('student', 'name')
      .populate('job', 'title')
      .populate('company', 'companyProfile.companyName');

    res.json({
      stats: {
        totalStudents, placedStudents,
        placementRate: totalStudents ? ((placedStudents / totalStudents) * 100).toFixed(1) : 0,
        totalCompanies, activeJobs, pendingApplications, scheduledInterviews
      },
      recentDrives,
      todayInterviews
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.toggleUserStatus = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    user.isActive = !user.isActive;
    await user.save();
    res.json({ message: `User ${user.isActive ? 'activated' : 'deactivated'}`, isActive: user.isActive });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.updateStudentPlacementStatus = async (req, res) => {
  try {
    const { placementStatus, offeredCompany, offeredRole, offeredPackage } = req.body;
    const student = await User.findByIdAndUpdate(req.params.id, {
      'studentProfile.placementStatus': placementStatus,
      'studentProfile.offeredCompany': offeredCompany,
      'studentProfile.offeredRole': offeredRole,
      'studentProfile.offeredPackage': offeredPackage
    }, { new: true }).select('-password');
    res.json(student);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.bulkUpdateStatus = async (req, res) => {
  try {
    const { studentIds, placementStatus } = req.body;
    await User.updateMany(
      { _id: { $in: studentIds } },
      { 'studentProfile.placementStatus': placementStatus }
    );
    res.json({ message: `Updated ${studentIds.length} students` });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.createAdmin = async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ message: 'Email already exists' });
    const admin = await User.create({ name, email, password, role: 'admin' });
    res.status(201).json({ message: 'Admin created', admin });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
