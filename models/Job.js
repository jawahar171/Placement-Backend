const mongoose = require('mongoose');

const jobSchema = new mongoose.Schema({
  company: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, required: true, trim: true },
  description: { type: String, required: true },
  responsibilities: [String],
  requirements: [String],
  type: { type: String, enum: ['full-time', 'internship', 'contract'], required: true },
  location: String,
  isRemote: { type: Boolean, default: false },
  package: Number,        // Annual, in LPA
  stipend: Number,        // Monthly, for internships
  bond: Number,           // Bond period in months
  openings: { type: Number, default: 1 },
  eligibility: {
    minCGPA: { type: Number, default: 0 },
    maxBacklogs: { type: Number, default: 0 },
    allowedDepartments: [String],
    allowedBatches: [String],
    tenthMin: Number,
    twelfthMin: Number
  },
  skills: [String],
  applicationDeadline: { type: Date, required: true },
  status: { type: String, enum: ['active', 'closed', 'draft'], default: 'active' },
  placementDrive: { type: mongoose.Schema.Types.ObjectId, ref: 'PlacementDrive' },
  selectionProcess: [String], // ['Resume Screening', 'Aptitude Test', 'Technical Interview', 'HR Interview']
  applicationCount: { type: Number, default: 0 },
  offerCount: { type: Number, default: 0 }
}, { timestamps: true });

module.exports = mongoose.model('Job', jobSchema);
