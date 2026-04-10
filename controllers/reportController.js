const Application    = require('../models/Application');
const Interview      = require('../models/Interview');
const User           = require('../models/User');
const Job            = require('../models/Job');
const PlacementDrive = require('../models/PlacementDrive');

// ── Placement stats (admin) ────────────────────────────────────────────────
exports.getPlacementStats = async (req, res) => {
  try {
    const [
      totalStudents, placed,
      totalCompanies, totalJobs,
      totalApplications, totalInterviews, totalOffers
    ] = await Promise.all([
      User.countDocuments({ role: 'student', isActive: true }),
      User.countDocuments({ role: 'student', isPlaced: true }),       // flat field
      User.countDocuments({ role: 'company', isActive: true }),
      Job.countDocuments({ status: 'active' }),
      Application.countDocuments(),
      Interview.countDocuments(),
      Application.countDocuments({ status: { $in: ['offered', 'offer_accepted'] } })
    ]);

    const notPlaced     = totalStudents - placed;
    const placementRate = totalStudents > 0
      ? ((placed / totalStudents) * 100).toFixed(1)
      : 0;

    // Department-wise placements — flat field
    const deptWise = await User.aggregate([
      { $match: { role: 'student', isActive: true } },
      {
        $group: {
          _id:    '$department',
          total:  { $sum: 1 },
          placed: { $sum: { $cond: [{ $eq: ['$isPlaced', true] }, 1, 0] } }
        }
      },
      { $sort: { placed: -1 } }
    ]);

    // Monthly offers trend
    const monthlyOffers = await Application.aggregate([
      {
        $match: {
          status:    { $in: ['offered', 'offer_accepted'] },
          createdAt: { $gte: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000) }
        }
      },
      {
        $group: {
          _id:   { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } },
          count: { $sum: 1 }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } }
    ]);

    // Package distribution — flat ctc field
    const packageDist = await User.aggregate([
      { $match: { role: 'student', isPlaced: true, ctc: { $gt: 0 } } },
      {
        $bucket: {
          groupBy:    '$ctc',
          boundaries: [0, 300000, 500000, 800000, 1200000, 2000000, 5000000],
          default:    'Other',
          output:     { count: { $sum: 1 } }
        }
      }
    ]);

    // Top hiring companies
    const topCompanies = await Application.aggregate([
      { $match: { status: { $in: ['offered', 'offer_accepted'] } } },
      { $group: { _id: '$company', hires: { $sum: 1 } } },
      { $sort: { hires: -1 } },
      { $limit: 5 },
      { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'company' } },
      { $unwind: '$company' },
      {
        $project: {
          hires:                1,
          'company.name':       1,
          'company.companyName':1,
          'company.logoUrl':    1
        }
      }
    ]);

    // Application status breakdown
    const appStatusBreakdown = await Application.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);

    // Package stats — flat ctc field
    const packageStats = await User.aggregate([
      { $match: { role: 'student', isPlaced: true, ctc: { $gt: 0 } } },
      {
        $group: {
          _id:     null,
          highest: { $max: '$ctc' },
          average: { $avg: '$ctc' },
          lowest:  { $min: '$ctc' }
        }
      }
    ]);

    res.json({
      overview: {
        totalStudents, placed, notPlaced,
        placementRate, totalCompanies, totalJobs,
        totalApplications, totalInterviews, totalOffers
      },
      packageStats:      packageStats[0] || { highest: 0, average: 0, lowest: 0 },
      deptWise,
      monthlyOffers,
      packageDist,
      topCompanies,
      appStatusBreakdown
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── Drive report ───────────────────────────────────────────────────────────
exports.getDriveReport = async (req, res) => {
  try {
    const drive = await PlacementDrive.findById(req.params.id)
      .populate('companies',          'name companyName logoUrl')
      .populate('registeredStudents', 'name department cgpa isPlaced');

    if (!drive) return res.status(404).json({ message: 'Drive not found' });

    const jobs   = await Job.find({ placementDrive: drive._id });
    const jobIds = jobs.map(j => j._id);

    const applications = await Application.find({ job: { $in: jobIds } })
      .populate('student', 'name email cgpa department batch')
      .populate('job',     'title package');

    const interviews = await Interview.countDocuments({ job: { $in: jobIds } });
    const offers     = applications.filter(a => ['offered', 'offer_accepted'].includes(a.status)).length;
    const accepted   = applications.filter(a => a.status === 'offer_accepted').length;

    res.json({
      drive,
      stats: {
        registered: drive.registeredStudents?.length || 0,
        applied:    applications.length,
        interviews,
        offers,
        accepted
      },
      applications,
      jobs
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── Export CSV ─────────────────────────────────────────────────────────────
exports.exportCSV = async (req, res) => {
  try {
    const students = await User.find({ role: 'student', isActive: true })
      .select('-password')
      .lean();

    if (!students.length) {
      return res.status(404).json({ message: 'No students found' });
    }

    // Use flat fields matching User model
    const rows = students.map(s => ({
      Name:              s.name          || '',
      Email:             s.email         || '',
      'Roll Number':     s.rollNumber    || '',
      Department:        s.department    || '',
      Batch:             s.batch         || '',
      CGPA:              s.cgpa          || '',
      Skills:            (s.skills || []).join('; '),
      'Placement Status': s.isPlaced ? 'placed' : 'not_placed',
      'Offered Company': s.placedAt      || '',
      'Package (LPA)':   s.ctc           || '',
    }));

    const headers = Object.keys(rows[0]).join(',');
    const csv = [
      headers,
      ...rows.map(r => Object.values(r).map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=placement-report.csv');
    res.send(csv);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};