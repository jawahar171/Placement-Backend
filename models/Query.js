const mongoose = require('mongoose');

const replySchema = new mongoose.Schema({
  author:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  role:      { type: String, enum: ['student', 'company', 'admin'] },
  message:   { type: String, required: true, trim: true },
  createdAt: { type: Date, default: Date.now }
});

const querySchema = new mongoose.Schema({
  ticketId:  { type: String, unique: true },

  raisedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  role:      { type: String, enum: ['student', 'company'], required: true },

  category: {
    type: String,
    enum: ['application', 'interview', 'job', 'profile', 'technical', 'offer', 'drive', 'other'],
    required: true
  },
  priority:  { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
  subject:   { type: String, required: true, trim: true, maxlength: 120 },
  message:   { type: String, required: true, trim: true },

  status:    { type: String, enum: ['open', 'in_progress', 'resolved', 'closed'], default: 'open' },

  replies:   [replySchema],

  resolvedAt:  { type: Date },
  resolvedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

// Auto-generate ticket ID like QRY-00042
querySchema.pre('save', async function (next) {
  if (!this.ticketId) {
    const count = await mongoose.model('Query').countDocuments();
    this.ticketId = `QRY-${String(count + 1).padStart(5, '0')}`;
  }
  next();
});

module.exports = mongoose.model('Query', querySchema);
