const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    name:     { type: String, required: true, trim: true },
    email:    { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, minlength: 6, select: false },
    role:     { type: String, enum: ['student', 'company', 'admin'], required: true },

    // ── Student fields ───────────────────────────────────────────────────
    rollNumber:        { type: String, trim: true },
    department:        { type: String, trim: true },
    batch:             { type: String, trim: true },
    cgpa:              { type: Number, default: 0 },
    tenthPercentage:   { type: Number, default: 0 },
    twelfthPercentage: { type: Number, default: 0 },
    backlogs:          { type: Number, default: 0 },
    skills:            [{ type: String }],
    resumeUrl:         { type: String },
    resumePublicId:    { type: String },
    profilePhoto:      { type: String },
    isPlaced:          { type: Boolean, default: false },
    placedAt:          { type: String },
    ctc:               { type: Number },
    phone:             { type: String },
    address:           { type: String },
    linkedin:          { type: String },
    github:            { type: String },
    portfolio:         { type: String },

    // ── Company fields ───────────────────────────────────────────────────
    companyName:  { type: String, trim: true },
    industry:     { type: String, trim: true },
    website:      { type: String },
    description:  { type: String },
    logoUrl:      { type: String },

    // ── Shared ───────────────────────────────────────────────────────────
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

module.exports = mongoose.model('User', userSchema);