const router = require('express').Router();
const ctrl = require('../controllers/interviewController');
const { protect, authorize } = require('../middleware/auth');

router.post('/schedule', protect, authorize('company', 'admin'), ctrl.scheduleInterview);
router.get('/my', protect, ctrl.getMyInterviews);
router.get('/all', protect, authorize('admin'), ctrl.getAllInterviews);
router.get('/:id', protect, ctrl.getInterviewById);
router.patch('/:id/feedback', protect, authorize('company'), ctrl.submitFeedback);
router.patch('/:id/cancel', protect, ctrl.cancelInterview);
router.patch('/:id/reschedule', protect, authorize('company', 'admin'), ctrl.rescheduleInterview);

module.exports = router;
