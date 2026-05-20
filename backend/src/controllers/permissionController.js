const db = require('../config/db');
const { v4: uuid } = require('uuid');

const getAll = async (req, res) => {
  const { employee_id, date } = req.query;
  let sql = `SELECT p.*, e.full_name, e.employee_code, a.full_name AS approved_by_name
             FROM permissions p
             JOIN employees e ON e.id = p.employee_id
             LEFT JOIN admins a ON a.id = p.approved_by
             WHERE 1=1`;
  const params = [];
  if (employee_id) { sql += ' AND p.employee_id=?'; params.push(employee_id); }
  if (date) { sql += ' AND p.perm_date=?'; params.push(date); }
  sql += ' ORDER BY p.perm_date DESC';
  const { rows } = await db.query(sql, params);
  res.json(rows);
};

const create = async (req, res) => {
  const { employee_id, perm_date, perm_type, reason } = req.body;
  try {
    const id = uuid();
    await db.query(
      'INSERT INTO permissions (id,employee_id,perm_date,perm_type,reason) VALUES (?,?,?,?,?)',
      [id, employee_id, perm_date, perm_type, reason]
    );
    res.status(201).json({ id, employee_id, perm_date, perm_type, reason });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

const approve = async (req, res) => {
  const { id } = req.params;
  const client = await db.getClient();
  try {
    await client.BEGIN();
    // Approve permission
    await client.query(
      'UPDATE permissions SET is_approved=1, approved_by=? WHERE id=?',
      [req.admin.id, id]
    );
    // Fetch permission details
    const { rows: perms } = await client.query(
      'SELECT * FROM permissions WHERE id=?', [id]
    );
    const perm = perms[0];
    if (!perm) throw new Error('Permission not found');

    // If early_exit or full_day → mark full-day present in attendance
    if (['early_exit', 'full_day', 'medical'].includes(perm.perm_type)) {
      const attId = uuid();
      const { rows: empRows } = await client.query(
        'SELECT shift_id FROM employees WHERE id=?', [perm.employee_id]
      );
      await client.query(
        `INSERT INTO attendance_logs
           (id, employee_id, shift_id, log_date, attendance_code, hr_override, hr_note, hr_override_by, permission_id)
         VALUES (?,?,?,?,1,1,?,?,?)
         ON DUPLICATE KEY UPDATE attendance_code=1, hr_override=1, hr_note=?, hr_override_by=?, permission_id=?`,
        [attId, perm.employee_id, empRows[0]?.shift_id, perm.perm_date,
         `Permission: ${perm.perm_type}`, req.admin.id, id,
         `Permission: ${perm.perm_type}`, req.admin.id, id]
      );
      await client.query(
        `INSERT INTO audit_logs (id,admin_id,action,target_table,target_id,new_values)
         VALUES (?,?,?,?,?,?)`,
        [uuid(), req.admin.id, 'APPROVE_PERMISSION', 'permissions', id,
         JSON.stringify({ perm_type: perm.perm_type, date: perm.perm_date })]
      );
    }
    await client.COMMIT();
    res.json({ message: 'Permission approved and attendance updated' });
  } catch (e) {
    await client.ROLLBACK();
    res.status(500).json({ error: e.message });
  } finally { client.release(); }
};

const reject = async (req, res) => {
  await db.query('UPDATE permissions SET is_approved=0 WHERE id=?', [req.params.id]);
  res.json({ message: 'Permission rejected' });
};

module.exports = { getAll, create, approve, reject };
