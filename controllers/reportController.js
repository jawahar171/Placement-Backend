const Application = require('../models/Application');
const Interview = require('../models/Interview');
const User = require('../models/User');
const Job = require('../models/Job');
const PlacementDrive = require('../models/PlacementDrive');

exports.getPlacementStats = async (req, res) => {
  try {
    const [
      totalStudents, placed, optedOut,
      totalCompanies, totalJobs, totalApplications,
      totalInterviews, totalOffers
    ] = await Promise.all([
      User.countDocuments({ role: 'student', isActive: true }),
      User.countDocuments({ role: 'student', 'studentProfile.placementStatus': 'placed' }),
      User.countDocuments({ role: 'student', 'studentProfile.placementStatus': 'opted_out' }),
      User.countDocuments({ role: 'company', isActive: true }),
      Job.countDocuments({ status: 'active' }),
      Application.countDocuments(),
      Interview.countDocuments(),
      Application.countDocuments({ status: { $in: ['offered', 'offer_accepted'] } })
    ]);

    const notPlaced = totalStudents - placed - optedOut;
    const placementRate = totalStudents > 0 ? ((placed / (totalStudents - optedOut)) * 100).toFixed(1) : 0;

    // Department-wise placements
    const deptWise = await User.aggregate([
      { $match: { role: 'student', isActive: true } },
      {
        $group: {
          _id: '$studentProfile.department',
          total: { $sum: 1 },
          placed: {
            $sum: { $cond: [{ $eq: ['$studentProfile.placementStatus', 'placed'] }, 1, 0] }
          }
        }
      },
      { $sort: { placed: -1 } }
    ]);

    // Monthly offers trend
    const monthlyOffers = await Application.aggregate([
      { $match: { status: { $in: ['offered', 'offer_accepted'] }, createdAt: { $gte: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000) } } },
      {
        $group: {
          _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } },
          count: { $sum: 1 }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } }
    ]);

    // Package distribution
    const packageDist = await User.aggregate([
      { $match: { role: 'student', 'studentProfile.placementStatus': 'placed' } },
      {
        $bucket: {
          groupBy: '$studentProfile.offeredPackage',
          boundaries: [0, 3, 5, 8, 12, 20, 50],
          default: 'Other',
          output: { count: { $sum: 1 } }
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
      { $project: { hires: 1, 'company.companyProfile.companyName': 1, 'company.companyProfile.logoUrl': 1 } }
    ]);

    // Application status breakdown
    const appStatusBreakdown = await Application.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);

    // Highest and average packages
    const packageStats = await User.aggregate([
      { $match: { role: 'student', 'studentProfile.placementStatus': 'placed', 'studentProfile.offeredPackage': { $gt: 0 } } },
      {
        $group: {
          _id: null,
          highest: { $max: '$studentProfile.offeredPackage' },
          average: { $avg: '$studentProfile.offeredPackage' },
          lowest: { $min: '$studentProfile.offeredPackage' }
        }
      }
    ]);

    res.json({
      overview: {
        totalStudents, placed, notPlaced, optedOut,
        placementRate, totalCompanies, totalJobs,
        totalApplications, totalInterviews, totalOffers
      },
      packageStats: packageStats[0] || { highest: 0, average: 0, lowest: 0 },
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

exports.getDriveReport = async (req, res) => {
  try {
    const drive = await PlacementDrive.findById(req.params.id)
      .populate('companies', 'companyProfile.companyName')
      .populate('registeredStudents', 'name studentProfile.department studentProfile.cgpa studentProfile.placementStatus');

    if (!drive) return res.status(404).json({ message: 'Drive not found' });

    const jobs = await Job.find({ placementDrive: drive._id });
    const jobIds = jobs.map(j => j._id);

    const applications = await Application.find({ job: { $in: jobIds } })
      .populate('student', 'name email studentProfile')
      .populate('job', 'title package');

    const interviews = await Interview.countDocuments({ job: { $in: jobIds } });
    const offers = applications.filter(a => ['offered', 'offer_accepted'].includes(a.status)).length;
    const accepted = applications.filter(a => a.status === 'offer_accepted').length;

    res.json({
      drive,
      stats: {
        registered: drive.registeredStudents.length,
        applied: applications.length,
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

exports.exportCSV = async (req, res) => {
  try {
    const students = await User.find({
      role: 'student',
      isActive: true
    }).select('-password').lean();

    const rows = students.map(s => ({
      Name: s.name,
      Email: s.email,
      'Roll Number': s.studentProfile?.rollNumber || '',
      Department: s.studentProfile?.department || '',
      Batch: s.studentProfile?.batch || '',
      CGPA: s.studentProfile?.cgpa || '',
      Skills: (s.studentProfile?.skills || []).join('; '),
      'Placement Status': s.studentProfile?.placementStatus || 'not_placed',
      'Offered Company': s.studentProfile?.offeredCompany || '',
      'Offered Role': s.studentProfile?.offeredRole || '',
      'Package (LPA)': s.studentProfile?.offeredPackage || ''
    }));

    const headers = Object.keys(rows[0] || {}).join(',');
    const csv = [
      headers,
      ...rows.map(r => Object.values(r).map(v => `"${v}"`).join(','))
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=placement-report.csv');
    res.send(csv);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
