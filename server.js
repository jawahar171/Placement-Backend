require('dotenv').config();
const express    = require('express');
const mongoose   = require('mongoose');
const cors       = require('cors');
const http       = require('http');
const { Server } = require('socket.io');

const authRoutes         = require('./routes/authRoutes');
const studentRoutes      = require('./routes/studentRoutes');
const companyRoutes      = require('./routes/companyRoutes');
const applicationRoutes  = require('./routes/applicationRoutes');
const interviewRoutes    = require('./routes/interviewRoutes');
const jobRoutes          = require('./routes/jobRoutes');
const adminRoutes        = require('./routes/adminRoutes');
const driveRoutes        = require('./routes/driveRoutes');
const reportRoutes       = require('./routes/reportRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const chatRoutes          = require('./routes/chatRoutes');

const app    = express();
const server = http.createServer(app);

// ── CORS ──────────────────────────────────────────────────────────────────
const allowedOrigins = [
  process.env.CLIENT_URL || 'http://localhost:5173',
  'https://college-placements.netlify.app',
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Socket.io ─────────────────────────────────────────────────────────────
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});
io.on('connection', (socket) => {
  socket.on('join', (userId) => socket.join(userId));
  socket.on('disconnect', () => {});
});
app.set('io', io);

// ── Health check ──────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({ message: 'Backend is running successfully ✅' });
});

// ── Routes ────────────────────────────────────────────────────────────────
app.use('/api/auth',          authRoutes);
app.use('/api/students',      studentRoutes);
app.use('/api/companies',     companyRoutes);
app.use('/api/applications',  applicationRoutes);
app.use('/api/interviews',    interviewRoutes);
app.use('/api/jobs',          jobRoutes);
app.use('/api/drives',        driveRoutes);
app.use('/api/reports',       reportRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/admin',         adminRoutes);
app.use('/api/chat',          chatRoutes);

// ── 404 ───────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ message: `Route ${req.method} ${req.originalUrl} not found` });
});

// ── Global error handler ──────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  res.status(err.status || 500).json({ message: err.message || 'Internal server error' });
});

// ── Start ─────────────────────────────────────────────────────────────────
mongoose
  .connect(process.env.MONGO_URI)
  .then(async () => {
  console.log('✅ MongoDB connected');
  
  // Auto-seed demo users if they don't exist
  const bcrypt = require('bcryptjs');
  const User = require('./models/User');
  const adminExists = await User.findOne({ email: 'admin@demo.com' });
  if (!adminExists) {
    const hash = await bcrypt.hash('password123', 10);
    await User.insertMany([
      { name:'Admin',   email:'admin@demo.com',   password:hash, role:'admin' },
      { name:'Student', email:'student@demo.com', password:hash, role:'student', rollNumber:'S001', department:'CS', batch:'2025' },
      { name:'Company', email:'company@demo.com', password:hash, role:'company', companyName:'Acme', industry:'Tech' }
    ]);
    console.log('✅ Demo users seeded');
  }

  const PORT = process.env.PORT || 5000;
  server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
})
  .catch((err) => {
    console.error('❌ MongoDB error:', err.message);
    process.exit(1);
  });