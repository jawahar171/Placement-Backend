const router = require('express').Router();
const ctrl = require('../controllers/companyController');
const { protect, authorize } = require('../middleware/authMiddleware');

router.get('/dashboard', protect, authorize('company'), ctrl.getDashboard);
router.get('/profile', protect, authorize('company'), ctrl.getProfile);
router.patch('/profile', protect, authorize('company'), ctrl.updateProfile);
router.get('/', protect, ctrl.getAllCompanies);
router.get('/:id', protect, ctrl.getCompanyById);

module.exports = router;
