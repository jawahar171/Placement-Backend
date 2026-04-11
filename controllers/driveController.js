const PlacementDrive = require('../models/PlacementDrive');
const User = require('../models/User');
const { createNotification } = require('../utils/notifications');

exports.createDrive = async (req, res) => {
  try {
    const drive = await PlacementDrive.create({ ...req.body, createdBy: req.user._id });

    // Notify all eligible students
    const query = { role: 'student', isActive: true };
    if (req.body.eligibility?.allowedDepartments?.length) {
      query['department'] = { $in: req.body.eligibility.allowedDepartments };
    }
    const students = await User.find(query).select('_id');

    for (const student of students) {
      await createNotification(req.io, {
        recipient: student._id,
        type: 'drive_announced',
        title: `New Placement Drive: ${drive.title}`,
        message: `A new placement drive has been announced. Register now!`,
        link: `/student/drives/${drive._id}`
      });
    }

    res.status(201).json(drive);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getAllDrives = async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const query = status ? { status } : {};

    const total = await PlacementDrive.countDocuments(query);
    const drives = await PlacementDrive.find(query)
      .populate('companies', 'name companyName logoUrl')
      .populate('createdBy', 'name')
      .sort({ startDate: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    res.json({ drives, total, pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getDriveById = async (req, res) => {
  try {
    const drive = await PlacementDrive.findById(req.params.id)
      .populate('companies', 'name companyName email logoUrl')
      .populate('jobs')
      .populate('registeredStudents', 'name email department cgpa rollNumber');

    if (!drive) return res.status(404).json({ message: 'Drive not found' });
    res.json(drive);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.updateDrive = async (req, res) => {
  try {
    const drive = await PlacementDrive.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!drive) return res.status(404).json({ message: 'Drive not found' });
    res.json(drive);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.registerForDrive = async (req, res) => {
  try {
    const drive = await PlacementDrive.findById(req.params.id);
    if (!drive) return res.status(404).json({ message: 'Drive not found' });
    if (drive.status === 'completed' || drive.status === 'cancelled') {
      return res.status(400).json({ message: 'Drive is no longer active' });
    }

    const alreadyRegistered = drive.registeredStudents.includes(req.user._id);
    if (alreadyRegistered) return res.status(400).json({ message: 'Already registered' });

    drive.registeredStudents.push(req.user._id);
    drive.stats.totalRegistered = drive.registeredStudents.length;
    await drive.save();

    res.json({ message: 'Registered successfully', drive });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.unregisterFromDrive = async (req, res) => {
  try {
    const drive = await PlacementDrive.findById(req.params.id);
    if (!drive) return res.status(404).json({ message: 'Drive not found' });

    drive.registeredStudents = drive.registeredStudents.filter(
      s => s.toString() !== req.user._id.toString()
    );
    drive.stats.totalRegistered = drive.registeredStudents.length;
    await drive.save();

    res.json({ message: 'Unregistered successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.addCompanyToDrive = async (req, res) => {
  try {
    const drive = await PlacementDrive.findById(req.params.id);
    if (!drive) return res.status(404).json({ message: 'Drive not found' });
    if (!drive.companies.includes(req.body.companyId)) {
      drive.companies.push(req.body.companyId);
      await drive.save();
    }
    res.json(drive);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};