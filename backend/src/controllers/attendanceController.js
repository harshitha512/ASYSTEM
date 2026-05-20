const db = require('../config/db');
const axios = require('axios');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuid } = require('uuid');
const FormDataNode = require('form-data');
const { isHolidayOrSunday } = require('./holidayController');

// ── Multer ──────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(process.env.UPLOAD_DIR || './uploads', 'snapshots');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => cb(null, `snap_${Date.now()}${path.extname(file.originalname)}`),
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

// ── Helpers ─────────────────────────────────────────────────
const toMins = (timeStr) => {
  if (!timeStr) return 0;
  const [h, m] = String(timeStr).split(':').map(Number);
  return h * 60 + m;
};

const timeOfDay = (dt) => {
  const d = new Date(dt);
  return d.getHours() * 60 + d.getMinutes();
};

const calcOT = (checkOut, shiftEnd, otWindowStart, otWindowEnd, isNight) => {
  const coMins = timeOfDay(checkOut);
  const seMins = toMins(shiftEnd);
  const otStart = toMins(otWindowStart);
  const otEnd = toMins(otWindowEnd);
  // OT must be within the valid OT window and after shift end
  if (coMins <= seMins) return { ot: 0, withinWindow: false };
  const withinWindow = isNight
    ? coMins >= otStart || coMins <= otEnd
    : coMins >= otStart && coMins <= otEnd;
  const otMins = Math.max(0, Math.min(coMins, otEnd) - seMins);
  return { ot: Math.min(parseFloat((otMins / 60).toFixed(2)), 2), withinWindow };
};

// ── Check 8-day continuous absence ─────────────────────────
const checkEightDayBlock = async (employeeId) => {
  const today = new Date().toISOString().split('T')[0];
  const { rows } = await db.query(
    `SELECT attendance_code, log_date FROM attendance_logs
     WHERE employee_id=? AND log_date < ?
     ORDER BY log_date DESC LIMIT 8`, [employeeId, today]
  );
  if (rows.length < 8) return false;
  const allAbsent = rows.every(r => r.attendance_code === 0);
  return allAbsent;
};

// ── MARK ATTENDANCE via face ────────────────────────────────
const markAttendance = [
  upload.single('image'),
  async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Snapshot image required' });
    try {
      // Face recognition — use form-data package for Python FastAPI compatibility
      const fd = new FormDataNode();
      fd.append('image', fs.createReadStream(req.file.path), {
        filename: req.file.filename,
        contentType: req.file.mimetype,
      });
      const faceRes = await axios.post(
        `${process.env.FACE_SERVICE_URL}/recognize`,
        fd,
        { headers: fd.getHeaders() }
      );

      const { employee_id } = faceRes.data;
      if (!employee_id) return res.status(404).json({ error: 'Face not recognized', match: false });

      // Get employee + shift
      const { rows: empRows } = await db.query(
        `SELECT e.*, s.shift_name, s.start_time, s.end_time, s.in_late, s.out_early,
                s.ot_window_start, s.ot_window_end, s.is_night_shift
         FROM employees e
         LEFT JOIN shifts s ON s.id = e.shift_id
         WHERE e.id=? AND e.status='active'`, [employee_id]
      );
      if (!empRows.length) return res.status(403).json({ error: 'Employee not active or not found' });
      const emp = empRows[0];

      // Blocked check
      if (emp.status === 'blocked') return res.status(403).json({ error: 'Biometric access blocked. Contact HR.' });

      const today = new Date().toISOString().split('T')[0];

      // Holiday / Sunday check
      if (await isHolidayOrSunday(today)) {
        return res.status(400).json({ error: 'Today is a holiday or Sunday. No attendance recorded.' });
      }

      const { rows: existing } = await db.query(
        'SELECT * FROM attendance_logs WHERE employee_id=? AND log_date=?', [employee_id, today]
      );

      const now = new Date();
      let action, logRecord;

      if (!existing.length) {
        // ── CHECK IN ──
        const isLateIn = emp.in_late
          ? timeOfDay(now) > toMins(emp.in_late)
          : false;
        const attId = uuid();
        await db.query(
          `INSERT INTO attendance_logs
             (id,employee_id,shift_id,log_date,attendance_code,check_in,is_late_in,snapshot_path)
           VALUES (?,?,?,?,1,?,?,?)`,
          [attId, employee_id, emp.shift_id, today, now, isLateIn ? 1 : 0, req.file.path]
        );
        const { rows } = await db.query('SELECT * FROM attendance_logs WHERE id=?', [attId]);
        logRecord = rows[0];
        action = 'CHECK_IN';
      } else {
        const record = existing[0];
        if (record.check_out) return res.status(400).json({ error: 'Already checked out today', log: record });
        if (record.punch_out_missing) return res.status(400).json({ error: 'Previous punch-out unresolved. Contact HR.' });

        // ── CHECK OUT ──
        const totalHours = parseFloat(((now - new Date(record.check_in)) / 3600000).toFixed(2));
        const fullShiftDone = totalHours >= 8;
        const isEarlyOut = emp.out_early ? timeOfDay(now) < toMins(emp.out_early) : false;

        // Punch-out missing detection: out before shift even started (data anomaly)
        const punchMissing = totalHours < 0.5;

        await db.query(
          `UPDATE attendance_logs SET check_out=?,total_hours=?,is_early_out=?,
           punch_out_missing=?,updated_at=NOW() WHERE id=?`,
          [now, totalHours, isEarlyOut ? 1 : 0, punchMissing ? 1 : 0, record.id]
        );

        if (punchMissing) {
          await db.query(
            `INSERT INTO punch_errors (id,employee_id,error_date,error_type)
             VALUES (?,?,?,'missing_punch_out')`,
            [uuid(), employee_id, today]
          );
        }

        // OT: only if full shift done and NOT punch missing
        if (fullShiftDone && !punchMissing && emp.ot_window_start) {
          const { ot, withinWindow } = calcOT(
            now, emp.end_time, emp.ot_window_start, emp.ot_window_end, emp.is_night_shift
          );
          if (ot > 0 && withinWindow) {
            await db.query(
              `INSERT INTO overtime_adjustments
                 (id,attendance_id,employee_id,ot_date,actual_hours,system_ot,within_window,full_shift_done)
               VALUES (?,?,?,?,?,?,1,1)
               ON DUPLICATE KEY UPDATE
                 system_ot=VALUES(system_ot), actual_hours=VALUES(actual_hours),
                 within_window=1, full_shift_done=1`,
              [uuid(), record.id, employee_id, today, totalHours, ot]
            );
          }
        }

        // Check 8-day block
        const shouldBlock = await checkEightDayBlock(employee_id);
        if (shouldBlock) {
          await db.query(
            `UPDATE employees SET status='blocked', blocked_since=? WHERE id=?`,
            [today, employee_id]
          );
        }

        const { rows } = await db.query('SELECT * FROM attendance_logs WHERE id=?', [record.id]);
        logRecord = rows[0];
        action = 'CHECK_OUT';
      }

      res.json({ action, employee: { id: emp.id, name: emp.full_name, department: emp.department }, log: logRecord });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: e.response?.data?.detail || e.message });
    }
  }
];

// ── HR Manual Attendance Control ─────────────────────────────
const hrManualMark = async (req, res) => {
  const { employee_id, log_date, attendance_code, hr_note, check_in, check_out } = req.body;
  const client = await db.getClient();
  try {
    await client.BEGIN();
    const { rows: empRows } = await client.query(
      'SELECT shift_id FROM employees WHERE id=?', [employee_id]
    );
    const shift_id = empRows[0]?.shift_id;
    const attId = uuid();

    let totalHours = null;
    if (check_in && check_out) {
      totalHours = parseFloat(((new Date(check_out) - new Date(check_in)) / 3600000).toFixed(2));
    }

    await client.query(
      `INSERT INTO attendance_logs
         (id,employee_id,shift_id,log_date,attendance_code,check_in,check_out,total_hours,hr_override,hr_note,hr_override_by)
       VALUES (?,?,?,?,?,?,?,?,1,?,?)
       ON DUPLICATE KEY UPDATE
         attendance_code=VALUES(attendance_code),check_in=VALUES(check_in),
         check_out=VALUES(check_out),total_hours=VALUES(total_hours),
         hr_override=1,hr_note=VALUES(hr_note),hr_override_by=VALUES(hr_override_by),updated_at=NOW()`,
      [attId, employee_id, shift_id, log_date, attendance_code,
       check_in || null, check_out || null, totalHours, hr_note, req.admin.id]
    );
    await client.query(
      `INSERT INTO audit_logs (id,admin_id,action,target_table,new_values)
       VALUES (?,?,'HR_MANUAL_MARK','attendance_logs',?)`,
      [uuid(), req.admin.id, JSON.stringify({ employee_id, log_date, attendance_code, hr_note })]
    );

    // Unblock employee if HR marks present
    if (attendance_code === 1) {
      await client.query(
        `UPDATE employees SET status='active', blocked_since=NULL WHERE id=? AND status='blocked'`,
        [employee_id]
      );
    }
    await client.COMMIT();
    res.json({ message: 'Attendance updated by HR' });
  } catch (e) {
    await client.ROLLBACK();
    res.status(500).json({ error: e.message });
  } finally { client.release(); }
};

// ── Unblock employee ─────────────────────────────────────────
const unblockEmployee = async (req, res) => {
  const { employee_id } = req.body;
  try {
    await db.query(`UPDATE employees SET status='active', blocked_since=NULL WHERE id=?`, [employee_id]);
    await db.query(
      `INSERT INTO audit_logs (id,admin_id,action,target_table,target_id)
       VALUES (?,?,'UNBLOCK_EMPLOYEE','employees',?)`,
      [uuid(), req.admin.id, employee_id]
    );
    res.json({ message: 'Employee unblocked' });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

// ── Get Attendance Logs ──────────────────────────────────────
const getAttendance = async (req, res) => {
  const { date, from, to, employee_id, shift_id, code } = req.query;
  let sql = `SELECT a.*, e.full_name, e.employee_code, e.department, e.gender,
             s.shift_name, s.start_time AS shift_start, s.end_time AS shift_end,
             COALESCE(ot.final_ot,0) AS final_ot, ot.system_ot, ot.manual_ot, ot.ot_remarks, ot.id AS ot_id
             FROM attendance_logs a
             JOIN employees e ON e.id=a.employee_id
             LEFT JOIN shifts s ON s.id=a.shift_id
             LEFT JOIN overtime_adjustments ot ON ot.attendance_id=a.id
             WHERE 1=1`;
  const p = [];
  if (date) { sql += ' AND a.log_date=?'; p.push(date); }
  if (from && to) { sql += ' AND a.log_date BETWEEN ? AND ?'; p.push(from, to); }
  if (employee_id) { sql += ' AND a.employee_id=?'; p.push(employee_id); }
  if (shift_id) { sql += ' AND a.shift_id=?'; p.push(shift_id); }
  if (code !== undefined) { sql += ' AND a.attendance_code=?'; p.push(code); }
  sql += ' ORDER BY a.log_date DESC, e.full_name';
  const { rows } = await db.query(sql, p);
  res.json(rows);
};

// ── Dashboard Stats ──────────────────────────────────────────
const getDashboardStats = async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const [total, present, absent, leave, ot, blocked, punchErr] = await Promise.all([
      db.query('SELECT COUNT(*) AS c FROM employees WHERE status != ?', ['inactive']),
      db.query('SELECT COUNT(*) AS c FROM attendance_logs WHERE log_date=? AND attendance_code=1', [today]),
      db.query('SELECT COUNT(*) AS c FROM attendance_logs WHERE log_date=? AND attendance_code=0', [today]),
      db.query('SELECT COUNT(*) AS c FROM attendance_logs WHERE log_date=? AND attendance_code=6', [today]),
      db.query(`SELECT COALESCE(SUM(ot.final_ot),0) AS c FROM overtime_adjustments ot
                JOIN attendance_logs a ON a.id=ot.attendance_id WHERE a.log_date=?`, [today]),
      db.query(`SELECT COUNT(*) AS c FROM employees WHERE status='blocked'`),
      db.query(`SELECT COUNT(*) AS c FROM punch_errors WHERE error_date=? AND resolved=0`, [today]),
    ]);
    res.json({
      total_employees: total.rows[0].c,
      present_today:   present.rows[0].c,
      absent_today:    absent.rows[0].c,
      leave_today:     leave.rows[0].c,
      total_ot_today:  parseFloat(ot.rows[0].c),
      blocked_employees: blocked.rows[0].c,
      punch_errors_today: punchErr.rows[0].c,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

// ── Punch Errors ─────────────────────────────────────────────
const getPunchErrors = async (req, res) => {
  const { rows } = await db.query(
    `SELECT pe.*, e.full_name, e.employee_code, a.full_name AS resolver_name
     FROM punch_errors pe
     JOIN employees e ON e.id=pe.employee_id
     LEFT JOIN admins a ON a.id=pe.resolved_by
     ORDER BY pe.error_date DESC`
  );
  res.json(rows);
};

const resolvePunchError = async (req, res) => {
  const { notes } = req.body;
  await db.query(
    `UPDATE punch_errors SET resolved=1, resolved_by=?, resolved_at=NOW(), notes=? WHERE id=?`,
    [req.admin.id, notes, req.params.id]
  );
  res.json({ message: 'Punch error resolved' });
};

module.exports = {
  markAttendance, hrManualMark, unblockEmployee,
  getAttendance, getDashboardStats,
  getPunchErrors, resolvePunchError
};