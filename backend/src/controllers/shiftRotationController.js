const db = require('../config/db');
const { v4: uuid } = require('uuid');

// Rotation rule: A→C, B→A, C→B, G=permanent
const ROTATION_MAP = { A: 'C', B: 'A', C: 'B', G: null };

// ── Get next Saturday ─────────────────────────────────────
const getNextSaturday = () => {
  const d = new Date();
  const day = d.getDay();
  const diff = (6 - day + 7) % 7 || 7;
  d.setDate(d.getDate() + diff);
  return d.toISOString().split('T')[0];
};

// ── Get dept restrictions ─────────────────────────────────
const getDeptRestrictions = async (req, res) => {
  const { rows } = await db.query('SELECT * FROM dept_shift_restrictions ORDER BY department');
  res.json(rows);
};

const addDeptRestriction = async (req, res) => {
  const { department, excluded_shift } = req.body;
  try {
    await db.query(
      'INSERT INTO dept_shift_restrictions (id,department,excluded_shift,created_by) VALUES (?,?,?,?)',
      [uuid(), department, excluded_shift, req.admin.id]
    );
    res.status(201).json({ message: 'Restriction added' });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Already exists' });
    res.status(500).json({ error: e.message });
  }
};

const removeDeptRestriction = async (req, res) => {
  await db.query('DELETE FROM dept_shift_restrictions WHERE id=?', [req.params.id]);
  res.json({ message: 'Removed' });
};

// ── Generate weekly rotation (called every Saturday) ──────
const generateWeeklyRotation = async (req, res) => {
  const rotationDate = req.body.rotation_date || getNextSaturday();
  const client = await db.getClient();
  try {
    await client.BEGIN();

    // Get all active employees with their shifts (exclude G shift)
    const { rows: employees } = await client.query(
      `SELECT e.id, e.full_name, e.department, e.shift_id,
              s.shift_name, s.id AS current_shift_id
       FROM employees e
       JOIN shifts s ON s.id = e.shift_id
       WHERE e.status = 'active' AND s.shift_name != 'G'`
    );

    // Get all shifts
    const { rows: allShifts } = await client.query('SELECT id, shift_name FROM shifts WHERE is_active=1');
    const shiftMap = {};
    allShifts.forEach(s => shiftMap[s.shift_name] = s.id);

    // Get dept restrictions
    const { rows: restrictions } = await client.query('SELECT department, excluded_shift FROM dept_shift_restrictions');
    const deptRestrictions = {};
    restrictions.forEach(r => {
      if (!deptRestrictions[r.department]) deptRestrictions[r.department] = [];
      deptRestrictions[r.department].push(r.excluded_shift);
    });

    const generated = [];
    const skipped   = [];

    for (const emp of employees) {
      const currentShift = emp.shift_name;
      const nextShiftName = ROTATION_MAP[currentShift];

      if (!nextShiftName) { skipped.push({ employee: emp.full_name, reason: 'G shift - permanent' }); continue; }

      // Check dept restriction
      const restricted = deptRestrictions[emp.department] || [];
      if (restricted.includes(nextShiftName)) {
        // Skip C shift for restricted depts — rotate to B instead
        const altShift = nextShiftName === 'C' ? 'B' : nextShiftName;
        const altId = shiftMap[altShift];
        if (altId) {
          await client.query(
            `INSERT INTO shift_rotation_schedule
               (id,employee_id,current_shift_id,next_shift_id,rotation_date,status,is_auto)
             VALUES (?,?,?,?,?,'pending',1)
             ON DUPLICATE KEY UPDATE next_shift_id=VALUES(next_shift_id), status='pending'`,
            [uuid(), emp.id, emp.current_shift_id, altId, rotationDate]
          );
          generated.push({ employee: emp.full_name, from: currentShift, to: altShift, note: 'C restricted - moved to B' });
        }
        continue;
      }

      const nextShiftId = shiftMap[nextShiftName];
      if (!nextShiftId) continue;

      await client.query(
        `INSERT INTO shift_rotation_schedule
           (id,employee_id,current_shift_id,next_shift_id,rotation_date,status,is_auto)
         VALUES (?,?,?,?,?,'pending',1)
         ON DUPLICATE KEY UPDATE next_shift_id=VALUES(next_shift_id), status='pending'`,
        [uuid(), emp.id, emp.current_shift_id, nextShiftId, rotationDate]
      );
      generated.push({ employee: emp.full_name, from: currentShift, to: nextShiftName });
    }

    await client.query(
      `INSERT INTO audit_logs (id,admin_id,action,new_values) VALUES (?,?,?,?)`,
      [uuid(), req.admin.id, 'GENERATE_ROTATION', JSON.stringify({ rotationDate, count: generated.length })]
    );

    await client.COMMIT();
    res.json({ rotation_date: rotationDate, generated, skipped, total: generated.length });
  } catch (e) {
    await client.ROLLBACK();
    res.status(500).json({ error: e.message });
  } finally { client.release(); }
};

// ── Get rotation schedule ─────────────────────────────────
const getRotationSchedule = async (req, res) => {
  const { date, status } = req.query;
  let sql = `SELECT r.*, e.full_name, e.employee_code, e.department,
             cs.shift_name AS current_shift, ns.shift_name AS next_shift,
             a.full_name AS approved_by_name
             FROM shift_rotation_schedule r
             JOIN employees e ON e.id=r.employee_id
             JOIN shifts cs ON cs.id=r.current_shift_id
             LEFT JOIN shifts ns ON ns.id=r.next_shift_id
             LEFT JOIN admins a ON a.id=r.approved_by
             WHERE 1=1`;
  const p = [];
  if (date)   { sql += ' AND r.rotation_date=?'; p.push(date); }
  if (status) { sql += ' AND r.status=?'; p.push(status); }
  sql += ' ORDER BY r.rotation_date DESC, e.full_name';
  const { rows } = await db.query(sql, p);
  res.json(rows);
};

// ── Approve/Reject rotation ───────────────────────────────
const approveRotation = async (req, res) => {
  const { id } = req.params;
  const client = await db.getClient();
  try {
    await client.BEGIN();
    const { rows } = await client.query('SELECT * FROM shift_rotation_schedule WHERE id=?', [id]);
    const rot = rows[0];
    if (!rot) return res.status(404).json({ error: 'Not found' });

    await client.query(
      `UPDATE shift_rotation_schedule SET status='approved', approved_by=?, approved_at=NOW() WHERE id=?`,
      [req.admin.id, id]
    );
    // Apply shift change on rotation date
    if (rot.next_shift_id) {
      await client.query(
        `UPDATE employees SET shift_id=? WHERE id=?`,
        [rot.next_shift_id, rot.employee_id]
      );
      await client.query(
        `UPDATE shift_rotation_schedule SET status='applied' WHERE id=?`, [id]
      );
    }
    await client.COMMIT();
    res.json({ message: 'Rotation approved and applied' });
  } catch (e) {
    await client.ROLLBACK();
    res.status(500).json({ error: e.message });
  } finally { client.release(); }
};

const rejectRotation = async (req, res) => {
  const { rejection_reason } = req.body;
  await db.query(
    `UPDATE shift_rotation_schedule SET status='rejected', approved_by=?, approved_at=NOW(), rejection_reason=? WHERE id=?`,
    [req.admin.id, rejection_reason, req.params.id]
  );
  res.json({ message: 'Rotation rejected' });
};

// ── Shift Change Requests (manual HR) ────────────────────
const getChangeRequests = async (req, res) => {
  const { status } = req.query;
  let sql = `SELECT r.*, e.full_name, e.employee_code, e.department,
             fs.shift_name AS from_shift, ts.shift_name AS to_shift,
             req.full_name AS requested_by_name, app.full_name AS approved_by_name
             FROM shift_change_requests r
             JOIN employees e ON e.id=r.employee_id
             JOIN shifts fs ON fs.id=r.from_shift_id
             JOIN shifts ts ON ts.id=r.to_shift_id
             LEFT JOIN admins req ON req.id=r.requested_by
             LEFT JOIN admins app ON app.id=r.approved_by
             WHERE 1=1`;
  const p = [];
  if (status) { sql += ' AND r.status=?'; p.push(status); }
  sql += ' ORDER BY r.created_at DESC';
  const { rows } = await db.query(sql, p);
  res.json(rows);
};

const createChangeRequest = async (req, res) => {
  const { employee_id, to_shift_id, effective_date, reason } = req.body;
  try {
    const { rows: emp } = await db.query('SELECT shift_id FROM employees WHERE id=?', [employee_id]);
    if (!emp.length) return res.status(404).json({ error: 'Employee not found' });
    const id = uuid();
    await db.query(
      `INSERT INTO shift_change_requests (id,employee_id,from_shift_id,to_shift_id,effective_date,reason,requested_by)
       VALUES (?,?,?,?,?,?,?)`,
      [id, employee_id, emp[0].shift_id, to_shift_id, effective_date, reason, req.admin.id]
    );
    res.status(201).json({ id, message: 'Change request created — pending HR approval' });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

const approveChangeRequest = async (req, res) => {
  const client = await db.getClient();
  try {
    await client.BEGIN();
    const { rows } = await client.query('SELECT * FROM shift_change_requests WHERE id=?', [req.params.id]);
    const req_ = rows[0];
    if (!req_) return res.status(404).json({ error: 'Not found' });
    await client.query(
      `UPDATE shift_change_requests SET status='approved', approved_by=?, approved_at=NOW() WHERE id=?`,
      [req.admin.id, req_.id]
    );
    await client.query(
      `UPDATE employees SET shift_id=? WHERE id=?`,
      [req_.to_shift_id, req_.employee_id]
    );
    await client.query(
      `INSERT INTO audit_logs (id,admin_id,action,target_table,target_id,new_values) VALUES (?,?,?,?,?,?)`,
      [uuid(), req.admin.id, 'APPROVE_SHIFT_CHANGE', 'employees', req_.employee_id,
       JSON.stringify({ to_shift_id: req_.to_shift_id, effective_date: req_.effective_date })]
    );
    await client.COMMIT();
    res.json({ message: 'Shift change approved and applied' });
  } catch (e) {
    await client.ROLLBACK();
    res.status(500).json({ error: e.message });
  } finally { client.release(); }
};

const rejectChangeRequest = async (req, res) => {
  const { rejection_reason } = req.body;
  await db.query(
    `UPDATE shift_change_requests SET status='rejected', approved_by=?, approved_at=NOW(), rejection_reason=? WHERE id=?`,
    [req.admin.id, rejection_reason, req.params.id]
  );
  res.json({ message: 'Request rejected' });
};

module.exports = {
  getDeptRestrictions, addDeptRestriction, removeDeptRestriction,
  generateWeeklyRotation, getRotationSchedule, approveRotation, rejectRotation,
  getChangeRequests, createChangeRequest, approveChangeRequest, rejectChangeRequest,
};
