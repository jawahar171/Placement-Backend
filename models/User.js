const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const academicRecordSchema = new mongoose.Schema({
  semester: Number,
  gpa: Number,
  subjects: [{ name: String, grade: String, credits: Number }]
}, { _id: false });

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true, minlength: 6 },
  role: { type: String, enum: ['student', 'company', 'admin'], default: 'student' },
  avatar: String,
  isActive: { type: Boolean, default: true },

  // Student-specific
  studentProfile: {
    rollNumber: { type: String, unique: true, sparse: true },
    department: String,
    batch: String,
    cgpa: { type: Number, min: 0, max: 10 },
    tenthPercentage: Number,
    twelfthPercentage: Number,
    activeBacklogs: { type: Number, default: 0 },
    skills: [String],
    resumeUrl: String,
    resumePublicId: String,
    coverLetterUrl: String,
    linkedIn: String,
    github: String,
    portfolio: String,
    phone: String,
    address: String,
    academicRecords: [academicRecordSchema],
    achievements: [String],
    certifications: [{ name: String, issuer: String, year: Number }],
    placementStatus: {
      type: String,
      enum: ['not_placed', 'placed', 'opted_out'],
      default: 'not_placed'
    },
    offeredCompany: String,
    offeredRole: String,
    offeredPackage: Number,
    offerAcceptedAt: Date
  },

  // Company-specific
  companyProfile: {
    companyName: String,
    industry: String,
    website: String,
    description: String,
    hrName: String,
    hrPhone: String,
    logoUrl: String,
    logoPublicId: String,
    address: String,
    employeeCount: String,
    foundedYear: Number,
    socialLinks: {
      linkedin: String,
      twitter: String
    }
  }
}, { timestamps: true });

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.matchPassword = async function (entered) {
  return await bcrypt.compare(entered, this.password);
};

userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  return obj;
};

module.exports = mongoose.model('User', userSchema);
