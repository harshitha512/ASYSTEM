const db = require('../config/db');
const multer = require('multer');
const path  = require('path');
const fs    = require('fs');
const axios = require('axios');
const { v4: uuid } = require('uuid');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(process.env.UPLOAD_DIR || './uploads',
      file.fieldname === 'image' ? 'faces' : 'imports');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => cb(null, `${Date.now()}_${file.originalname}`),
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

const getAll = async (req, res) => {
  try {
    const { status, department, shift_id } = req.query;
    let sql = `SELECT e.*, s.shift_name,
               (SELECT COUNT(*) FROM face_encodings fe WHERE fe.employee_id=e.id) AS has_face,
               (SELECT rs.rotation_date FROM shift_rotation_schedule rs
                WHERE rs.employee_id=e.id AND rs.status='pending'
                ORDER BY rs.rotation_date ASC LIMIT 1) AS next_rotation_date,
               (SELECT ns.shift_name FROM shift_rotation_schedule rs
                JOIN shifts ns ON ns.id=rs.next_shift_id
                WHERE rs.employee_id=e.id AND rs.status='pending'
                ORDER BY rs.rotation_date ASC LIMIT 1) AS next_rotation_shift
               FROM employees e
               LEFT JOIN shifts s ON s.id=e.shift_id
               WHERE 1=1`;
    const p = [];
    if (status)     { sql += ' AND e.status=?';          p.push(status); }
    if (department) { sql += ' AND e.department LIKE ?';  p.push(`%${department}%`); }
    if (shift_id)   { sql += ' AND e.shift_id=?';         p.push(shift_id); }
    sql += ' ORDER BY e.full_name';
    const { rows } = await db.query(sql, p);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
};

const getOne = async (req, res) => {
  const { rows } = await db.query(
    'SELECT e.*, s.shift_name FROM employees e LEFT JOIN shifts s ON s.id=e.shift_id WHERE e.id=?',
    [req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Not found' });
  res.json(rows[0]);
};

const create = async (req, res) => {
  const { employee_code, full_name, department, designation, gender, shift_id, status } = req.body;
  try {
    const id = uuid();
    await db.query(
      `INSERT INTO employees (id,employee_code,full_name,department,designation,gender,shift_id,status)
       VALUES (?,?,?,?,?,?,?,?)`,
      [id, employee_code, full_name, department, designation, gender||'male', shift_id||null, status||'active']
    );
    await db.query(
      `INSERT INTO audit_logs (id,admin_id,action,target_table,target_id,new_values) VALUES (?,?,?,?,?,?)`,
      [uuid(), req.admin.id, 'CREATE_EMPLOYEE', 'employees', id, JSON.stringify({ employee_code, full_name })]
    );
    const { rows } = await db.query('SELECT * FROM employees WHERE id=?', [id]);
    res.status(201).json(rows[0]);
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Employee code already exists' });
    res.status(500).json({ error: e.message });
  }
};

const update = async (req, res) => {
  const { full_name, department, designation, gender, shift_id, status } = req.body;
  try {
    await db.query(
      `UPDATE employees SET full_name=?,department=?,designation=?,gender=?,shift_id=?,status=?,updated_at=NOW() WHERE id=?`,
      [full_name, department, designation, gender, shift_id||null, status, req.params.id]
    );
    await db.query(
      `INSERT INTO audit_logs (id,admin_id,action,target_table,target_id,new_values) VALUES (?,?,?,?,?,?)`,
      [uuid(), req.admin.id, 'UPDATE_EMPLOYEE', 'employees', req.params.id, JSON.stringify(req.body)]
    );
    const { rows } = await db.query('SELECT * FROM employees WHERE id=?', [req.params.id]);
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
};

const remove = async (req, res) => {
  await db.query('DELETE FROM employees WHERE id=?', [req.params.id]);
  await db.query(
    `INSERT INTO audit_logs (id,admin_id,action,target_table,target_id) VALUES (?,?,?,?,?)`,
    [uuid(), req.admin.id, 'DELETE_EMPLOYEE', 'employees', req.params.id]
  );
  res.json({ message: 'Deleted' });
};

// ── Face Registration ─────────────────────────────────────
const FormDataNode = require('form-data');
const faceUpload = upload.single('image');
const registerFace = [
  faceUpload,
  async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Image required' });
    try {
      // Use form-data package — works reliably with Python FastAPI
      const fd = new FormDataNode();
      fd.append('image', fs.createReadStream(req.file.path), {
        filename: req.file.filename,
        contentType: req.file.mimetype,
      });
      fd.append('employee_id', req.params.id);

      const faceRes = await axios.post(
        `${process.env.FACE_SERVICE_URL}/register`,
        fd,
        { headers: fd.getHeaders() }
      );

      // Sync has_face flag
      await db.query(
        `UPDATE employees SET has_face=1, face_registered_at=NOW() WHERE id=?`,
        [req.params.id]
      );
      await db.query(
        `INSERT INTO audit_logs (id,admin_id,action,target_table,target_id) VALUES (?,?,?,?,?)`,
        [uuid(), req.admin.id, 'REGISTER_FACE', 'face_encodings', req.params.id]
      );
      res.json({ message: 'Face registered successfully', data: faceRes.data });
    } catch (e) {
      console.error('Face registration error:', e.response?.data || e.message);
      const errMsg = e.response?.data?.detail || e.response?.data?.error || e.message;
      res.status(500).json({ error: 'Face registration failed: ' + errMsg });
    }
  },
];

// ── Bulk Import (CSV) ─────────────────────────────────────
const csvUpload = upload.single('file');
const bulkImport = [
  csvUpload,
  async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'CSV file required' });
    const { rows: shifts } = await db.query('SELECT id, shift_name FROM shifts');
    const shiftMap = {};
    shifts.forEach(s => shiftMap[s.shift_name.toUpperCase()] = s.id);

    const content = fs.readFileSync(req.file.path, 'utf8');
    const lines   = content.split('\n').filter(l => l.trim());
    const headers = lines[0].toLowerCase().split(',').map(h => h.trim().replace(/"/g,''));

    const results  = [];
    const errors   = [];
    let successCount = 0;

    for (let i = 1; i < lines.length; i++) {
      const vals = lines[i].split(',').map(v => v.trim().replace(/"/g,''));
      const row  = {};
      headers.forEach((h, idx) => row[h] = vals[idx] || '');

      try {
        const id = uuid();
        const shiftId = shiftMap[(row.shift||'').toUpperCase()] || null;
        await db.query(
          `INSERT INTO employees (id,employee_code,full_name,department,designation,gender,shift_id,status)
           VALUES (?,?,?,?,?,?,?,?)
           ON DUPLICATE KEY UPDATE
             full_name=VALUES(full_name), department=VALUES(department),
             designation=VALUES(designation), gender=VALUES(gender),
             shift_id=VALUES(shift_id), updated_at=NOW()`,
          [id, row.employee_code||row.code, row.full_name||row.name,
           row.department||row.dept, row.designation||row.role,
           row.gender||'male', shiftId, row.status||'active']
        );
        successCount++;
        results.push({ row: i, employee_code: row.employee_code||row.code, status: 'success' });
      } catch (e) {
        errors.push({ row: i, employee_code: row.employee_code||row.code, error: e.message });
      }
    }

    const logId = uuid();
    await db.query(
      `INSERT INTO bulk_import_logs (id,imported_by,total_rows,success_rows,failed_rows,error_details)
       VALUES (?,?,?,?,?,?)`,
      [logId, req.admin.id, lines.length - 1, successCount, errors.length, JSON.stringify(errors)]
    );

    res.json({
      message: `Import complete: ${successCount} success, ${errors.length} failed`,
      total: lines.length - 1,
      success: successCount,
      failed: errors.length,
      errors,
    });
  },
];

// ── Export employees as CSV ───────────────────────────────
const exportCSV = async (req, res) => {
  const { rows } = await db.query(
    `SELECT e.employee_code, e.full_name, e.department, e.designation,
            e.gender, s.shift_name AS shift, e.status
     FROM employees e LEFT JOIN shifts s ON s.id=e.shift_id
     WHERE e.status != 'inactive' ORDER BY e.full_name`
  );
  const headers = ['employee_code','full_name','department','designation','gender','shift','status'];
  const body = rows.map(r => headers.map(h => `"${r[h]||''}"`).join(','));
  const csv  = [headers.join(','), ...body].join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="employees.csv"');
  res.send(csv);
};

// ── Download CSV template ─────────────────────────────────
const downloadTemplate = (req, res) => {
  const csv = 'employee_code,full_name,department,designation,gender,shift,status\n' +
              'EMP001,John Smith,Production,Operator,male,A,active\n' +
              'EMP002,Jane Doe,HR,Executive,female,G,active\n';
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="employee_import_template.csv"');
  res.send(csv);
};

module.exports = { getAll, getOne, create, update, remove, registerFace, bulkImport, exportCSV, downloadTemplate };
