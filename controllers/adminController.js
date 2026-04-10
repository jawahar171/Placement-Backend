const User           = require('../models/User');
const Application    = require('../models/Application');
const Job            = require('../models/Job');
const Interview      = require('../models/Interview');
const PlacementDrive = require('../models/PlacementDrive');

// ── Admin dashboard ────────────────────────────────────────────────────────
exports.getDashboard = async (req, res) => {
  try {
    const [
      totalStudents, placedStudents, totalCompanies,
      activeJobs, pendingApplications, scheduledInterviews,
      recentDrives
    ] = await Promise.all([
      User.countDocuments({ role: 'student', isActive: true }),
      User.countDocuments({ role: 'student', isPlaced: true }),       // flat field
      User.countDocuments({ role: 'company', isActive: true }),
      Job.countDocuments({ status: 'active' }),
      Application.countDocuments({ status: 'submitted' }),
      Interview.countDocuments({ status: 'scheduled', scheduledAt: { $gte: new Date() } }),
      PlacementDrive.find().sort({ createdAt: -1 }).limit(5)
        .populate('companies', 'name companyName logoUrl')
    ]);

    const todayStart = new Date(new Date().setHours(0, 0, 0, 0));
    const todayEnd   = new Date(new Date().setHours(23, 59, 59, 999));

    const todayInterviews = await Interview.find({
      scheduledAt: { $gte: todayStart, $lte: todayEnd }
    })
      .populate('student', 'name')
      .populate('job',     'title')
      .populate('company', 'name companyName');

    res.json({
      stats: {
        totalStudents,
        placedStudents,
        placementRate:       totalStudents ? ((placedStudents / totalStudents) * 100).toFixed(1) : 0,
        totalCompanies,
        activeJobs,
        pendingApplications,
        scheduledInterviews
      },
      recentDrives,
      todayInterviews
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── Toggle user active status ──────────────────────────────────────────────
exports.toggleUserStatus = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    user.isActive = !user.isActive;
    await user.save();
    res.json({
      message:  `User ${user.isActive ? 'activated' : 'deactivated'}`,
      isActive: user.isActive
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── Update student placement status ───────────────────────────────────────
exports.updateStudentPlacementStatus = async (req, res) => {
  try {
    // Frontend sends: { placementStatus, offeredCompany, offeredRole, offeredPackage }
    const { placementStatus, offeredCompany, offeredRole, offeredPackage } = req.body;

    const update = {};
    if (placementStatus !== undefined) {
      update.isPlaced = placementStatus === 'placed';
      update.placementStatus = placementStatus;
    }
    if (offeredCompany !== undefined) update.offeredCompany = offeredCompany;
    if (offeredRole    !== undefined) update.offeredRole    = offeredRole;
    if (offeredPackage !== undefined) update.ctc            = parseFloat(offeredPackage) || 0;

    const student = await User.findByIdAndUpdate(
      req.params.id,
      update,
      { new: true }
    ).select('-password');

    if (!student) return res.status(404).json({ message: 'Student not found' });
    res.json(student);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── Bulk update student placement status ──────────────────────────────────
exports.bulkUpdateStatus = async (req, res) => {
  try {
    // Frontend sends: { studentIds, placementStatus: 'placed' | 'not_placed' | 'opted_out' }
    const { studentIds, placementStatus } = req.body;
    if (!studentIds?.length)
      return res.status(400).json({ message: 'studentIds array is required' });
    if (!placementStatus)
      return res.status(400).json({ message: 'placementStatus is required' });

    await User.updateMany(
      { _id: { $in: studentIds } },
      {
        placementStatus,
        isPlaced: placementStatus === 'placed',
      }
    );

    res.json({ message: `Updated ${studentIds.length} students` });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── Create admin user ──────────────────────────────────────────────────────
exports.createAdmin = async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ message: 'Email already exists' });

    const admin = await User.create({ name, email, password, role: 'admin' });
    res.status(201).json({
      message: 'Admin created successfully',
      admin:   { _id: admin._id, name: admin.name, email: admin.email, role: admin.role }
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};