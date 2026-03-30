// routes/auth.js
const router1 = require('express').Router();
const { register, login, getMe, changePassword } = require('../controllers/authController');
const { protect } = require('../middleware/auth');
router1.post('/register', register);
router1.post('/login', login);
router1.get('/me', protect, getMe);
router1.patch('/change-password', protect, changePassword);
module.exports = router1;
