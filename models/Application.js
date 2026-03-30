const mongoose = require('mongoose');

const applicationSchema = new mongoose.Schema({
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  job: { type: mongoose.Schema.Types.ObjectId, ref: 'Job', required: true },
  company: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  status: {
    type: String,
    enum: [
      'submitted',
      'reviewed',
      'shortlisted',
      'aptitude_scheduled',
      'aptitude_cleared',
      'interview_scheduled',
      'interview_completed',
      'offered',
      'offer_accepted',
      'offer_rejected',
      'rejected',
      'withdrawn'
    ],
    default: 'submitted'
  },
  coverLetter: String,
  resumeUrl: String,
  companyFeedback: String,
  offerLetterUrl: String,
  offeredPackage: Number,
  offeredRole: String,
  offerDeadline: Date,
  timeline: [{
    status: String,
    note: String,
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedAt: { type: Date, default: Date.now }
  }],
  isStarred: { type: Boolean, default: false }   // company can star promising candidates
}, { timestamps: true });

applicationSchema.index({ student: 1, job: 1 }, { unique: true });
applicationSchema.index({ company: 1, status: 1 });
applicationSchema.index({ student: 1, status: 1 });

module.exports = mongoose.model('Application', applicationSchema);
