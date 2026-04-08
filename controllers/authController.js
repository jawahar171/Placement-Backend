const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../models/User');

const signToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '7d',
  });

// POST /api/auth/register
exports.register = async (req, res) => {
  try {
    const { name, email, password, role, rollNumber, department, batch, companyName, industry } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Name, email and password are required.' });
    }
    if (!role || !['student', 'company', 'admin'].includes(role)) {
      return res.status(400).json({ message: 'Role must be student, company, or admin.' });
    }

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(409).json({ message: 'Email already registered.' });
    }

    const userData = { name, email, password, role };
    if (role === 'student') Object.assign(userData, { rollNumber, department, batch });
    if (role === 'company') Object.assign(userData, { companyName, industry });

    const user = await User.create(userData);
    const token = signToken(user._id);

    res.status(201).json({
      message: 'Registration successful.',
      token,
      user: { id: user._id, name: user.name, email: user.email, role: user.role },
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ message: 'Server error during registration.', error: err.message });
  }
};

// POST /api/auth/login
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required.' });
    }

    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    const token = signToken(user._id);
    const userData = { id: user._id, name: user.name, email: user.email, role: user.role };
    if (user.role === 'student') Object.assign(userData, { rollNumber: user.rollNumber, department: user.department, batch: user.batch, cgpa: user.cgpa, isPlaced: user.isPlaced });
    if (user.role === 'company') Object.assign(userData, { companyName: user.companyName, industry: user.industry });

    res.json({ message: 'Login successful.', token, user: userData });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Server error during login.', error: err.message });
  }
};

// GET /api/auth/me
exports.getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found.' });
    res.json({ user });
  } catch (err) {
    res.status(500).json({ message: 'Server error.', error: err.message });
  }
};

// POST /api/auth/logout
exports.logout = (req, res) => {
  res.json({ message: 'Logged out successfully.' });
};