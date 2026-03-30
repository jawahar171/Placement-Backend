const mongoose = require('mongoose');

const interviewSchema = new mongoose.Schema({
  application: { type: mongoose.Schema.Types.ObjectId, ref: 'Application', required: true },
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  company: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  job: { type: mongoose.Schema.Types.ObjectId, ref: 'Job', required: true },
  scheduledAt: { type: Date, required: true },
  duration: { type: Number, default: 60 },
  format: { type: String, enum: ['in-person', 'virtual', 'phone'], default: 'virtual' },
  round: { type: Number, default: 1 },
  roundName: { type: String, default: 'Technical Round' },
  status: {
    type: String,
    enum: ['scheduled', 'ongoing', 'completed', 'cancelled', 'no_show', 'rescheduled'],
    default: 'scheduled'
  },
  meetingUrl: String,
  meetingRoomName: String,
  venue: String,
  interviewers: [String],
  agenda: String,
  feedback: {
    technicalRating: { type: Number, min: 1, max: 5 },
    communicationRating: { type: Number, min: 1, max: 5 },
    problemSolvingRating: { type: Number, min: 1, max: 5 },
    overallRating: { type: Number, min: 1, max: 5 },
    strengths: String,
    improvements: String,
    comments: String,
    result: { type: String, enum: ['pass', 'fail', 'hold', 'pending'], default: 'pending' }
  },
  reminderSent24h: { type: Boolean, default: false },
  reminderSent1h: { type: Boolean, default: false },
  cancelReason: String
}, { timestamps: true });

module.exports = mongoose.model('Interview', interviewSchema);
