const router = require('express').Router();
const { protect, authorize } = require('../middleware/auth');
const { getPlacementStats, getDriveReport, exportCSV } = require('../controllers/reportController');

router.get('/stats', protect, authorize('admin'), getPlacementStats);
router.get('/drive/:id', protect, authorize('admin'), getDriveReport);
router.get('/export', protect, authorize('admin'), exportCSV);

module.exports = router;
