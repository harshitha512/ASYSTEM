require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const morgan  = require('morgan');
const path    = require('path');
const fs      = require('fs');

const app  = express();
const PORT = process.env.PORT || 5000;

const uploadDir = process.env.UPLOAD_DIR || './uploads';
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173', credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));
app.use('/uploads', express.static(path.resolve(uploadDir)));

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/auth',           require('./routes/auth'));
app.use('/api/employees',      require('./routes/employees'));
app.use('/api/shifts',         require('./routes/shifts'));
app.use('/api/holidays',       require('./routes/holidays'));
app.use('/api/permissions',    require('./routes/permissions'));
app.use('/api/shift-rotation', require('./routes/shiftRotation'));
app.use('/api/attendance',     require('./routes/attendance'));
app.use('/api/reports',        require('./routes/reports'));
app.use('/api/leaves',         require('./routes/leaves'));   // ✅ leaves route
app.use('/api/face',           require('./routes/face'));     // ✅ face route (NEW)

// ─── Health Check ─────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => res.json({ status: 'ok', ts: new Date() }));

// ─── Global Error Handler ─────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({ error: err.message || 'Internal Server Error' });
});

app.listen(PORT, () => console.log(`✅ Backend → http://localhost:${PORT}`));