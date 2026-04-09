const router = require('express').Router();
const ctrl = require('../controllers/adminController');
const { protect, authorize } = require('../middleware/authMiddleware');

router.get('/dashboard', protect, authorize('admin'), ctrl.getDashboard);
router.patch('/users/:id/toggle-status', protect, authorize('admin'), ctrl.toggleUserStatus);
router.patch('/students/:id/placement', protect, authorize('admin'), ctrl.updateStudentPlacementStatus);
router.post('/students/bulk-status', protect, authorize('admin'), ctrl.bulkUpdateStatus);
router.post('/create-admin', protect, authorize('admin'), ctrl.createAdmin);

module.exports = router;
