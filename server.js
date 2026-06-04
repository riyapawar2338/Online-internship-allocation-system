// server.js — AI Internship Allocation & Recommendation System

require('dotenv').config();

console.log("📦 MONGO_URI =", process.env.MONGO_URI);

const express     = require('express');
const cors        = require('cors');
const helmet      = require('helmet');
const morgan      = require('morgan');
const path        = require('path');
const rateLimit   = require('express-rate-limit');

const connectDB            = require('./config/db');
const { errorHandler }     = require('./middleware/errorHandler');

// ── Connect Database ──────────────────────────────────────────
connectDB().catch(err => {
  console.error("❌ MongoDB Connection Failed:", err.message);
});

// ── Create App ────────────────────────────────────────────────
const app = express();

// ── Security middleware ───────────────────────────────────────
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' }
  })
);

// ── CORS ──────────────────────────────────────────────────────
const allowedOrigins = [
  process.env.CLIENT_ORIGIN || 'http://127.0.0.1:5500',
  'http://localhost:5500',
  'http://127.0.0.1:3000',
  'http://localhost:3000',
  'null'
];

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    callback(new Error(`CORS policy blocked origin: ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ── Body parsers ──────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ── Logging ───────────────────────────────────────────────────
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// ── Rate limiting ─────────────────────────────────────────────
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many requests, please try again later.'
  },
});

app.use('/api/', apiLimiter);

// ── Static files ──────────────────────────────────────────────
app.use(
  '/uploads',
  express.static(path.join(__dirname, process.env.UPLOAD_PATH || 'uploads'))
);

// ── API Routes ────────────────────────────────────────────────
app.use('/api/auth',         require('./routes/authRoutes'));
app.use('/api/students',     require('./routes/studentRoutes'));
app.use('/api/internships',  require('./routes/internshipRoutes'));
app.use('/api/applications', require('./routes/applicationRoutes'));
app.use('/api/admin',        require('./routes/adminRoutes'));

// ── Health Check ──────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'Backend is running successfully',
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString(),
  });
});

// ── 404 Handler ───────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`,
  });
});

// ── Global error handler ──────────────────────────────────────
app.use(errorHandler);

// ── PORT FIXED HERE ───────────────────────────────────────────
const PORT = 5001; // 👈 IMPORTANT FIX (matches your frontend)

const server = app.listen(PORT, () => {
  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║  AI Internship Allocation System             ║');
  console.log('╠══════════════════════════════════════════════╣');
  console.log(`║  🚀 Server : http://localhost:${PORT}         ║`);
  console.log(`║  🌿 Env    : ${process.env.NODE_ENV || 'development'}`);
  console.log('╚══════════════════════════════════════════════╝\n');
});

// ── Handle crashes ────────────────────────────────────────────
process.on('unhandledRejection', (err) => {
  console.error('❌ Unhandled Rejection:', err.message);
  server.close(() => process.exit(1));
});
