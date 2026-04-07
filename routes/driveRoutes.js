// Save this file content into 4 separate files as shown below

// ===== routes/drives.js =====
const express = require('express');
const driveRouter = express.Router();
const driveCtrl = require('../controllers/driveController');
const { protect, authorize } = require('../middleware/auth');

driveRouter.post('/', protect, authorize('admin'), driveCtrl.createDrive);
driveRouter.get('/', protect, driveCtrl.getAllDrives);
driveRouter.get('/:id', protect, driveCtrl.getDriveById);
driveRouter.patch('/:id', protect, authorize('admin'), driveCtrl.updateDrive);
driveRouter.post('/:id/register', protect, authorize('student'), driveCtrl.registerForDrive);
driveRouter.delete('/:id/unregister', protect, authorize('student'), driveCtrl.unregisterFromDrive);
driveRouter.post('/:id/companies', protect, authorize('admin'), driveCtrl.addCompanyToDrive);

module.exports = driveRouter;
