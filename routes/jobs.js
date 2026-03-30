const router = require('express').Router();
const ctrl = require('../controllers/jobController');
const { protect, authorize } = require('../middleware/auth');

router.post('/', protect, authorize('company', 'admin'), ctrl.createJob);
router.get('/', protect, ctrl.getAllJobs);
router.get('/company', protect, authorize('company'), ctrl.getCompanyJobs);
router.get('/:id', protect, ctrl.getJobById);
router.get('/:id/eligibility', protect, authorize('student'), ctrl.checkEligibility);
router.patch('/:id', protect, authorize('company', 'admin'), ctrl.updateJob);
router.delete('/:id', protect, authorize('company', 'admin'), ctrl.deleteJob);

module.exports = router;
