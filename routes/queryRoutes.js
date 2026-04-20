const router = require('express').Router();
const ctrl   = require('../controllers/queryController');
const { protect, authorize } = require('../middleware/authMiddleware');

router.post  ('/',              protect,                            ctrl.createQuery);
router.get   ('/',              protect,                            ctrl.getQueries);
router.get   ('/stats',         protect, authorize('admin'),        ctrl.getStats);
router.get   ('/:id',           protect,                            ctrl.getQueryById);
router.post  ('/:id/reply',     protect,                            ctrl.addReply);
router.patch ('/:id/status',    protect, authorize('admin'),        ctrl.updateStatus);
router.delete('/:id',           protect,                            ctrl.deleteQuery);

module.exports = router;
