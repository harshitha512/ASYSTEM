const db = require('../config/db');

const dailyReport = async (req, res) => {
  const { date } = req.query;
  const target = date || new Date().toISOString().split('T')[0];
  try {
    const { rows } = await db.query(
      `SELECT e.employee_code, e.full_name, e.department, e.designation, e.gender,
              s.shift_name, s.start_time AS shift_start, s.end_time AS shift_end,
              a.attendance_code, a.check_in, a.check_out, a.total_hours,
              a.is_late_in, a.is_early_out, a.punch_out_missing, a.hr_override, a.hr_note,
              COALESCE(ot.final_ot,0) AS final_ot, ot.system_ot, ot.ot_remarks
       FROM employees e
       LEFT JOIN attendance_logs a ON a.employee_id=e.id AND a.log_date=?
       LEFT JOIN shifts s ON s.id=e.shift_id
       LEFT JOIN overtime_adjustments ot ON ot.attendance_id=a.id
       WHERE e.status != 'inactive'
       ORDER BY e.department, e.full_name`, [target]
    );
    res.json({ date: target, records: rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

const monthlyReport = async (req, res) => {
  const y = req.query.year  || new Date().getFullYear();
  const m = req.query.month || new Date().getMonth() + 1;
  try {
    const { rows } = await db.query(
      `SELECT e.employee_code, e.full_name, e.department, e.gender,
              s.shift_name,
              SUM(CASE WHEN a.attendance_code=1 THEN 1 ELSE 0 END) AS days_present,
              SUM(CASE WHEN a.attendance_code=0 THEN 1 ELSE 0 END) AS days_absent,
              SUM(CASE WHEN a.attendance_code=6 THEN 1 ELSE 0 END) AS days_leave,
              SUM(CASE WHEN a.is_late_in=1 THEN 1 ELSE 0 END)      AS late_entries,
              SUM(CASE WHEN a.is_early_out=1 THEN 1 ELSE 0 END)    AS early_exits,
              SUM(CASE WHEN a.punch_out_missing=1 THEN 1 ELSE 0 END) AS punch_errors,
              COALESCE(SUM(a.total_hours),0) AS total_hours,
              COALESCE(SUM(ot.final_ot),0)   AS total_ot
       FROM employees e
       LEFT JOIN attendance_logs a ON a.employee_id=e.id
             AND YEAR(a.log_date)=? AND MONTH(a.log_date)=?
       LEFT JOIN shifts s ON s.id=e.shift_id
       LEFT JOIN overtime_adjustments ot ON ot.attendance_id=a.id
       WHERE e.status != 'inactive'
       GROUP BY e.id, e.employee_code, e.full_name, e.department, e.gender, s.shift_name
       ORDER BY e.department, e.full_name`, [y, m]
    );
    res.json({ year: y, month: m, records: rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

const shiftWiseReport = async (req, res) => {
  const { date } = req.query;
  const target = date || new Date().toISOString().split('T')[0];
  try {
    const { rows } = await db.query(
      `SELECT s.shift_name,
              COUNT(e.id) AS total_employees,
              SUM(CASE WHEN a.attendance_code=1 THEN 1 ELSE 0 END) AS present,
              SUM(CASE WHEN a.attendance_code=0 THEN 1 ELSE 0 END) AS absent,
              SUM(CASE WHEN a.attendance_code=6 THEN 1 ELSE 0 END) AS on_leave,
              SUM(CASE WHEN a.is_late_in=1 THEN 1 ELSE 0 END)      AS late_in,
              SUM(CASE WHEN a.is_early_out=1 THEN 1 ELSE 0 END)    AS early_out
       FROM shifts s
       LEFT JOIN employees e ON e.shift_id=s.id AND e.status='active'
       LEFT JOIN attendance_logs a ON a.employee_id=e.id AND a.log_date=?
       GROUP BY s.id, s.shift_name
       ORDER BY s.shift_name`, [target]
    );
    res.json({ date: target, records: rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

const absentEightDayReport = async (req, res) => {
  const y = req.query.year  || new Date().getFullYear();
  const m = req.query.month || new Date().getMonth() + 1;
  try {
    const { rows } = await db.query(
      `SELECT e.employee_code, e.full_name, e.department, e.gender, e.status,
              COUNT(a.id) AS absent_days,
              MAX(a.log_date) AS last_absent_date
       FROM employees e
       JOIN attendance_logs a ON a.employee_id=e.id AND a.attendance_code=0
             AND YEAR(a.log_date)=? AND MONTH(a.log_date)=?
       WHERE e.status != 'inactive'
       GROUP BY e.id, e.employee_code, e.full_name, e.department, e.gender, e.status
       HAVING absent_days >= 8
       ORDER BY absent_days DESC`, [y, m]
    );
    res.json({ year: y, month: m, records: rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

const leaveMonitorReport = async (req, res) => {
  const y = req.query.year  || new Date().getFullYear();
  const m = req.query.month || new Date().getMonth() + 1;
  try {
    const { rows } = await db.query(
      `SELECT e.gender,
              SUM(CASE WHEN a.attendance_code=6 THEN 1 ELSE 0 END) AS with_permission_leave,
              SUM(CASE WHEN a.attendance_code=0 THEN 1 ELSE 0 END) AS without_permission_absent,
              COUNT(a.id) AS total_days_recorded,
              ROUND(SUM(CASE WHEN a.attendance_code=6 THEN 1 ELSE 0 END)/COUNT(a.id)*100,2) AS leave_pct,
              ROUND(SUM(CASE WHEN a.attendance_code=0 THEN 1 ELSE 0 END)/COUNT(a.id)*100,2) AS absent_pct
       FROM employees e
       JOIN attendance_logs a ON a.employee_id=e.id
             AND YEAR(a.log_date)=? AND MONTH(a.log_date)=?
       WHERE e.status != 'inactive'
       GROUP BY e.gender`, [y, m]
    );
    const { rows: grand } = await db.query(
      `SELECT
              SUM(CASE WHEN a.attendance_code=6 THEN 1 ELSE 0 END) AS with_permission_leave,
              SUM(CASE WHEN a.attendance_code=0 THEN 1 ELSE 0 END) AS without_permission_absent,
              COUNT(a.id) AS total_days_recorded,
              ROUND(SUM(CASE WHEN a.attendance_code=6 THEN 1 ELSE 0 END)/COUNT(a.id)*100,2) AS leave_pct,
              ROUND(SUM(CASE WHEN a.attendance_code=0 THEN 1 ELSE 0 END)/COUNT(a.id)*100,2) AS absent_pct
       FROM employees e
       JOIN attendance_logs a ON a.employee_id=e.id
             AND YEAR(a.log_date)=? AND MONTH(a.log_date)=?
       WHERE e.status != 'inactive'`, [y, m]
    );
    res.json({ year: y, month: m, gender_wise: rows, grand_total: grand[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

const lateEarlyReport = async (req, res) => {
  const { from, to, shift_id } = req.query;
  let sql = `SELECT e.employee_code, e.full_name, e.department, e.gender,
             s.shift_name, s.start_time, s.end_time,
             a.log_date, a.check_in, a.check_out, a.is_late_in, a.is_early_out
             FROM attendance_logs a
             JOIN employees e ON e.id=a.employee_id
             LEFT JOIN shifts s ON s.id=a.shift_id
             WHERE (a.is_late_in=1 OR a.is_early_out=1)`;
  const p = [];
  if (from && to) { sql += ' AND a.log_date BETWEEN ? AND ?'; p.push(from, to); }
  if (shift_id)   { sql += ' AND a.shift_id=?'; p.push(shift_id); }
  sql += ' ORDER BY a.log_date DESC, e.full_name';
  try {
    const { rows } = await db.query(sql, p);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
};

const exportCSV = async (req, res) => {
  const { type } = req.query;
  let rows, filename;
  try {
    if (type === 'daily') {
      const target = req.query.date || new Date().toISOString().split('T')[0];
      const r = await db.query(
        `SELECT e.employee_code, e.full_name, e.department, e.gender,
                s.shift_name, a.attendance_code, a.check_in, a.check_out,
                a.total_hours, a.is_late_in, a.is_early_out,
                COALESCE(ot.final_ot,0) AS final_ot
         FROM employees e
         LEFT JOIN attendance_logs a ON a.employee_id=e.id AND a.log_date=?
         LEFT JOIN shifts s ON s.id=e.shift_id
         LEFT JOIN overtime_adjustments ot ON ot.attendance_id=a.id
         WHERE e.status != 'inactive' ORDER BY e.full_name`, [target]
      );
      rows = r.rows; filename = `daily_${target}.csv`;
    } else if (type === 'monthly') {
      const y = req.query.year || new Date().getFullYear();
      const m = req.query.month || new Date().getMonth() + 1;
      const r = await db.query(
        `SELECT e.employee_code, e.full_name, e.department, e.gender, s.shift_name,
                SUM(CASE WHEN a.attendance_code=1 THEN 1 ELSE 0 END) AS days_present,
                SUM(CASE WHEN a.attendance_code=0 THEN 1 ELSE 0 END) AS days_absent,
                SUM(CASE WHEN a.attendance_code=6 THEN 1 ELSE 0 END) AS days_leave,
                COALESCE(SUM(a.total_hours),0) AS total_hours,
                COALESCE(SUM(ot.final_ot),0)   AS total_ot
         FROM employees e
         LEFT JOIN attendance_logs a ON a.employee_id=e.id
               AND YEAR(a.log_date)=? AND MONTH(a.log_date)=?
         LEFT JOIN shifts s ON s.id=e.shift_id
         LEFT JOIN overtime_adjustments ot ON ot.attendance_id=a.id
         WHERE e.status != 'inactive'
         GROUP BY e.id ORDER BY e.full_name`, [y, m]
      );
      rows = r.rows; filename = `monthly_${y}_${m}.csv`;
    } else if (type === 'ot') {
      const y = req.query.year || new Date().getFullYear();
      const m = req.query.month || new Date().getMonth() + 1;
      const r = await db.query(
        `SELECT e.employee_code, e.full_name, e.department, ot.ot_date,
                ot.system_ot, ot.manual_ot, ot.final_ot, ot.within_window,
                ot.full_shift_done, ot.ot_remarks
         FROM overtime_adjustments ot
         JOIN employees e ON e.id=ot.employee_id
         WHERE YEAR(ot.ot_date)=? AND MONTH(ot.ot_date)=?
         ORDER BY e.full_name, ot.ot_date`, [y, m]
      );
      rows = r.rows; filename = `ot_${y}_${m}.csv`;
    } else if (type === 'punch_errors') {
      const r = await db.query(
        `SELECT pe.error_date, pe.error_type, pe.resolved, pe.notes,
                e.employee_code, e.full_name, a.full_name AS resolved_by
         FROM punch_errors pe
         JOIN employees e ON e.id=pe.employee_id
         LEFT JOIN admins a ON a.id=pe.resolved_by
         ORDER BY pe.error_date DESC`
      );
      rows = r.rows; filename = 'punch_errors.csv';
    } else if (type === 'hr_approvals') {
      const r = await db.query(
        `SELECT al.performed_at, al.action, al.target_table, al.new_values,
                a.full_name AS admin_name, a.username
         FROM audit_logs al
         LEFT JOIN admins a ON a.id=al.admin_id
         ORDER BY al.performed_at DESC LIMIT 500`
      );
      rows = r.rows; filename = 'hr_approvals.csv';
    }

    if (!rows || !rows.length) return res.status(404).json({ error: 'No data found' });
    const headers = Object.keys(rows[0]).join(',');
    const body = rows.map(r =>
      Object.values(r).map(v => v === null ? '' : `"${String(v).replace(/"/g,'""')}"`).join(',')
    );
    const csv = [headers, ...body].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (e) { res.status(500).json({ error: e.message }); }
};

module.exports = { dailyReport, monthlyReport, shiftWiseReport, absentEightDayReport, leaveMonitorReport, lateEarlyReport, exportCSV };
