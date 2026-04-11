const User = require('../models/User');
const Job = require('../models/Job');
const Application = require('../models/Application');

exports.getProfile = async (req, res) => {
  try {
    const company = await User.findById(req.user._id).select('-password');
    res.json(company);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const {
      name, companyName, industry, website, description,
      hrName, hrPhone, address, employeeCount, foundedYear, socialLinks
    } = req.body;

    const update = {
      name,
      'companyName': companyName,
      'industry': industry,
      'website': website,
      'description': description,
      'hrName': hrName,
      'hrPhone': hrPhone,
      'address': address,
      'employeeCount': employeeCount,
      'foundedYear': foundedYear,
      'linkedin': socialLinks?.linkedin, 'twitter': socialLinks?.twitter
    };
    Object.keys(update).forEach(k => update[k] === undefined && delete update[k]);

    const company = await User.findByIdAndUpdate(req.user._id, update, { new: true }).select('-password');
    res.json(company);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getDashboard = async (req, res) => {
  try {
    const companyId = req.user._id;

    const [
      activeJobs, totalApplications, shortlisted, offers,
      recentApplications
    ] = await Promise.all([
      Job.countDocuments({ company: companyId, status: 'active' }),
      Application.countDocuments({ company: companyId }),
      Application.countDocuments({ company: companyId, status: 'shortlisted' }),
      Application.countDocuments({ company: companyId, status: { $in: ['offered', 'offer_accepted'] } }),
      Application.find({ company: companyId })
        .populate('student', 'name email avatar department cgpa rollNumber')
        .populate('job', 'title')
        .sort({ createdAt: -1 })
        .limit(5)
    ]);

    const upcomingInterviews = await require('../models/Interview').find({
      company: companyId,
      status: 'scheduled',
      scheduledAt: { $gte: new Date() }
    })
      .populate('student', 'name email department cgpa rollNumber')
      .populate('job', 'title')
      .sort({ scheduledAt: 1 })
      .limit(5);

    res.json({
      stats: { activeJobs, totalApplications, shortlisted, offers },
      recentApplications,
      upcomingInterviews
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getAllCompanies = async (req, res) => {
  try {
    const { search, industry, page = 1, limit = 20, status } = req.query;
    const query = { role: 'company' };

    // Admins can filter by active/inactive; default for non-admins is active only
    if (req.user.role === 'admin') {
      if (status === 'inactive') query.isActive = false;
      else if (status === 'active') query.isActive = true;
      // if status not provided, admin sees ALL companies
    } else {
      query.isActive = true;
    }

    if (industry) query.industry = industry;
    if (search) {
      query.$or = [
        { companyName: { $regex: search, $options: 'i' } },
        { name:        { $regex: search, $options: 'i' } },
      ];
    }

    const total = await User.countDocuments(query);
    const companies = await User.find(query)
      .select('-password')
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    res.json({ companies, total, pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getCompanyById = async (req, res) => {
  try {
    const company = await User.findById(req.params.id).select('-password');
    if (!company || company.role !== 'company') {
      return res.status(404).json({ message: 'Company not found' });
    }
    const jobs = await Job.find({ company: req.params.id, status: 'active' });
    res.json({ company, jobs });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};