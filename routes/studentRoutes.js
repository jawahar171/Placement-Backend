const router = require('express').Router();
const ctrl = require('../controllers/studentController');
const { protect, authorize } = require('../middleware/authMiddleware');
const { uploadResume } = require('../config/cloudinary');

router.get('/dashboard', protect, authorize('student'), ctrl.getDashboard);
router.get('/profile', protect, authorize('student'), ctrl.getProfile);
router.patch('/profile', protect, authorize('student'), ctrl.updateProfile);
router.post('/resume', protect, authorize('student'), uploadResume.single('resume'), ctrl.uploadResume);
router.post('/resume/migrate', protect, authorize('student'), ctrl.migrateResume);
router.get('/resume/signed-url', protect, authorize('student'), ctrl.getResumeSignedUrl);
router.get('/resume/view', ctrl.viewResume);
router.patch('/academic-records', protect, authorize('student'), ctrl.updateAcademicRecords);
router.get('/', protect, authorize('admin', 'company'), ctrl.getAllStudents);
router.get('/:id/resume/signed-url', protect, authorize('admin', 'company'), ctrl.getResumeSignedUrl);
router.post('/:id/resume/migrate', protect, authorize('admin', 'company'), ctrl.migrateStudentResume);
router.post('/:id/resume/upload-migrate', protect, authorize('admin', 'company'), uploadResume.single('resume'), ctrl.uploadMigrateResume);
router.get('/:id/resume/view', ctrl.viewResume);
router.get('/:id', protect, ctrl.getStudentById);

module.exports = router;