const mongoose = require('mongoose');

const placementDriveSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  description: String,
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  venue: String,
  isVirtual: { type: Boolean, default: false },
  bannerUrl: String,
  companies: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  jobs: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Job' }],
  registeredStudents: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  eligibility: {
    minCGPA: { type: Number, default: 0 },
    allowedDepartments: [String],
    allowedBatches: [String]
  },
  status: {
    type: String,
    enum: ['upcoming', 'registration_open', 'ongoing', 'completed', 'cancelled'],
    default: 'upcoming'
  },
  registrationDeadline: Date,
  schedule: [{
    time: String,
    activity: String,
    venue: String
  }],
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  stats: {
    totalRegistered: { type: Number, default: 0 },
    totalInterviews: { type: Number, default: 0 },
    totalOffers: { type: Number, default: 0 },
    totalAccepted: { type: Number, default: 0 },
    highestPackage: { type: Number, default: 0 },
    averagePackage: { type: Number, default: 0 }
  }
}, { timestamps: true });

module.exports = mongoose.model('PlacementDrive', placementDriveSchema);
