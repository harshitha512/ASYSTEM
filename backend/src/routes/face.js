const express  = require('express');
const router   = express.Router();
const axios    = require('axios');
const multer   = require('multer');
const FormData = require('form-data');
const { pool: db } = require('../config/db');

const FACE_SERVICE = 'http://localhost:8000';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

// GET /face/health
router.get('/health', async (req, res) => {
  try {
    const { data } = await axios.get(`${FACE_SERVICE}/health`, { timeout: 3000 });
    res.json(data);
  } catch (err) {
    res.status(503).json({
      error: 'Face service is not running.',
      fix:   'Run:  cd face_service && python main.py'
    });
  }
});

// POST /face/register/:employee_id
router.post('/register/:employee_id', upload.single('photo'), async (req, res) => {
  try {
    const { employee_id } = req.params;

    const [[emp]] = await db.query(
      'SELECT id, employee_code, full_name FROM employees WHERE id = ?',
      [employee_id]
    );
    if (!emp)      return res.status(404).json({ error: 'Employee not found' });
    if (!req.file) return res.status(400).json({ error: 'No photo uploaded' });

    const form = new FormData();
    form.append('employee_id', emp.id.toString());
    form.append('image', req.file.buffer, {
      filename:    'face.jpg',
      contentType: req.file.mimetype || 'image/jpeg',
    });

    await axios.post(`${FACE_SERVICE}/register`, form, {
      headers: { ...form.getHeaders() },
      maxContentLength: Infinity,
      maxBodyLength:    Infinity,
    });

    await db.query(
      'UPDATE employees SET has_face = 1, face_registered_at = NOW() WHERE id = ?',
      [employee_id]
    );

    res.json({ success: true, message: `Face registered for ${emp.full_name}` });
  } catch (err) {
    const msg = err.response?.data?.detail || err.message || 'Face registration failed';
    console.error('[face/register]', msg);
    res.status(500).json({ error: msg });
  }
});

// POST /face/recognize
router.post('/recognize', upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No photo provided' });

    const form = new FormData();
    form.append('image', req.file.buffer, {
      filename:    'snapshot.jpg',
      contentType: req.file.mimetype || 'image/jpeg',
    });

    const { data: faceResult } = await axios.post(`${FACE_SERVICE}/recognize`, form, {
      headers: { ...form.getHeaders() },
      maxContentLength: Infinity,
      maxBodyLength:    Infinity,
    });

    if (!faceResult.employee_id) {
      return res.json({ matched: false, message: faceResult.reason || 'Face not recognised' });
    }

    const [[emp]] = await db.query(
      `SELECT e.id, e.employee_code, e.full_name, e.department, e.designation, s.shift_name
       FROM employees e
       LEFT JOIN shifts s ON s.id = e.shift_id
       WHERE e.id = ?`,
      [faceResult.employee_id]
    );

    if (!emp) return res.json({ matched: false, message: 'Employee not found in database' });

    const today = new Date().toISOString().split('T')[0];

    const [[existing]] = await db.query(
      `SELECT id, check_in, check_out FROM attendance
       WHERE employee_id = ? AND DATE(log_date) = ?`,
      [emp.id, today]
    );

    let action = '', attendId = null;

    if (!existing) {
      const [result] = await db.query(
        `INSERT INTO attendance (employee_id, log_date, check_in, status)
         VALUES (?, ?, NOW(), 'present')`,
        [emp.id, today]
      );
      attendId = result.insertId;
      action   = 'check_in';
    } else if (existing.check_in && !existing.check_out) {
      await db.query('UPDATE attendance SET check_out = NOW() WHERE id = ?', [existing.id]);
      attendId = existing.id;
      action   = 'check_out';
    } else {
      action   = 'already_done';
      attendId = existing.id;
    }

    res.json({
      matched:       true,
      action,
      confidence:    Math.round((faceResult.confidence || 0) * 100),
      attendance_id: attendId,
      time:          new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
      employee: {
        id:            emp.id,
        employee_code: emp.employee_code,
        full_name:     emp.full_name,
        department:    emp.department,
        designation:   emp.designation,
        shift_name:    emp.shift_name,
      },
    });
  } catch (err) {
    const msg = err.response?.data?.detail || err.message || 'Recognition failed';
    console.error('[face/recognize]', msg);
    res.status(500).json({ error: msg });
  }
});

// DELETE /face/unregister/:employee_id
router.delete('/unregister/:employee_id', async (req, res) => {
  try {
    const { employee_id } = req.params;
    await db.query('DELETE FROM face_encodings WHERE employee_id = ?', [employee_id]);
    await db.query('UPDATE employees SET has_face = 0, face_registered_at = NULL WHERE id = ?', [employee_id]);
    res.json({ success: true, message: 'Face registration removed' });
  } catch (err) {
    console.error('[face/unregister]', err.message);
    res.status(500).json({ error: 'Unregister failed' });
  }
});

module.exports = router;