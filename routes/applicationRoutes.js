const router = require('express').Router();
const ctrl = require('../controllers/applicationController');
const { protect, authorize } = require('../middleware/authMiddleware');

router.post('/job/:jobId', protect, authorize('student'), ctrl.applyForJob);
router.get('/my', protect, authorize('student'), ctrl.getMyApplications);
router.get('/company', protect, authorize('company'), ctrl.getCompanyApplications);
router.get('/all', protect, authorize('admin'), ctrl.getAllApplications);
router.get('/:id', protect, ctrl.getApplicationById);
router.patch('/:id/status', protect, authorize('company', 'admin'), ctrl.updateApplicationStatus);
router.patch('/:id/accept-offer', protect, authorize('student'), ctrl.acceptOffer);
router.patch('/:id/withdraw', protect, authorize('student'), ctrl.withdrawApplication);
router.patch('/:id/star', protect, authorize('company'), ctrl.toggleStar);

module.exports = router;
