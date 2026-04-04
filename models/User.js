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
  password: { type: String, required: true, minlength: 6, select: true },
  role: { type: String, enum: ['student', 'company', 'admin'], default: 'student' },
  isActive: { type: Boolean, default: true },
  avatar:     { type: String },
  username: { type: String, unique: true, sparse: true },

  studentProfile: {
    rollNumber: String,
    department: String,
    batch:      String,
  },
  companyProfile: {
    companyName: String,
    industry:    String,
  },


}, { timestamps: true })
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// ✅ Instance method used in authController.login and changePassword
userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password)
}

userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  return obj;
};

module.exports = mongoose.model('User', userSchema);
