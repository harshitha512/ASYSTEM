const db = require('../config/db');
const { v4: uuid } = require('uuid');

const OT_DAILY_MAX   = 2;
const OT_WEEKLY_MAX  = 4;
const OT_MONTHLY_MAX = 16;

// ── Update OT manually ───────────────────────────────────────
const updateOT = async (req, res) => {
  const { attendance_id, manual_ot, ot_remarks } = req.body;
  const client = await db.getClient();
  try {
    await client.BEGIN();
    const { rows: oldRows } = await client.query(
      'SELECT * FROM overtime_adjustments WHERE attendance_id=?', [attendance_id]
    );
    let result;
    if (oldRows.length) {
      await client.query(
        `UPDATE overtime_adjustments SET manual_ot=?,ot_remarks=?,updated_by=?,updated_at=NOW()
         WHERE attendance_id=?`,
        [manual_ot, ot_remarks, req.admin.id, attendance_id]
      );
    } else {
      const { rows: attRows } = await client.query(
        'SELECT employee_id, log_date, total_hours FROM attendance_logs WHERE id=?', [attendance_id]
      );
      const att = attRows[0];
      await client.query(
        `INSERT INTO overtime_adjustments
           (id,attendance_id,employee_id,ot_date,actual_hours,system_ot,manual_ot,ot_remarks,updated_by)
         VALUES (?,?,?,?,?,0,?,?,?)`,
        [uuid(), attendance_id, att.employee_id, att.log_date, att.total_hours || 0, manual_ot, ot_remarks, req.admin.id]
      );
    }
    await client.query(
      `INSERT INTO audit_logs (id,admin_id,action,target_table,target_id,old_values,new_values)
       VALUES (?,?,'UPDATE_OT','overtime_adjustments',?,?,?)`,
      [uuid(), req.admin.id, attendance_id,
       JSON.stringify(oldRows[0] || {}),
       JSON.stringify({ manual_ot, ot_remarks })]
    );
    await client.COMMIT();
    res.json({ message: 'OT updated' });
  } catch (e) {
    await client.ROLLBACK();
    res.status(500).json({ error: e.message });
  } finally { client.release(); }
};

// ── Month-End OT Finalization ────────────────────────────────
// Implements all 5 scenarios from the spec
const finalizeMonthOT = async (req, res) => {
  const { year, month } = req.body;
  const client = await db.getClient();
  try {
    await client.BEGIN();

    // Get all employees
    const { rows: employees } = await client.query(
      `SELECT id FROM employees WHERE status != 'inactive'`
    );

    const results = [];

    for (const emp of employees) {
      // --- Totals ---
      const { rows: attRows } = await client.query(
        `SELECT a.id, a.log_date, a.attendance_code, a.total_hours,
                COALESCE(ot.final_ot,0) AS final_ot, ot.id AS ot_id
         FROM attendance_logs a
         LEFT JOIN overtime_adjustments ot ON ot.attendance_id=a.id
         WHERE a.employee_id=? AND YEAR(a.log_date)=? AND MONTH(a.log_date)=?
         ORDER BY a.log_date`,
        [emp.id, year, month]
      );

      const absents = attRows.filter(r => r.attendance_code === 0);
      const totalRawOT = attRows.reduce((s, r) => s + parseFloat(r.final_ot || 0), 0);
      let adjustedOT = totalRawOT;

      // Scenario A: Adjust OT for absent days (deduct 8h per absent)
      if (absents.length > 1) {
        const deduction = absents.length * 8;
        adjustedOT = Math.max(0, totalRawOT - deduction);
        // Mark absents as present via OT deduction
        for (const abs of absents) {
          await client.query(
            `UPDATE attendance_logs SET attendance_code=1, hr_override=1,
             hr_note='OT-adjusted present', hr_override_by=? WHERE id=?`,
            [req.admin.id, abs.id]
          );
        }
      }

      // Scenario B: 1-day absent exception
      if (absents.length === 1 && (totalRawOT < 24 || totalRawOT - 8 < 16)) {
        // Do NOT deduct — leave adjustedOT as is
      }

      // Scenario C/D: Apply daily/weekly/monthly caps
      const dailyOTs = attRows.map(r => Math.min(parseFloat(r.final_ot || 0), OT_DAILY_MAX));
      let weekly = 0, weekCapped = 0;
      let finalMonthOT = 0;
      for (let i = 0; i < dailyOTs.length; i++) {
        const dayOT = dailyOTs[i];
        const day = new Date(attRows[i].log_date).getDay();
        if (day === 1) { weekly = 0; } // reset each Monday
        const allowed = Math.min(dayOT, OT_WEEKLY_MAX - weekly, OT_DAILY_MAX);
        weekly += allowed;
        finalMonthOT += allowed;
        if (finalMonthOT >= OT_MONTHLY_MAX) { finalMonthOT = OT_MONTHLY_MAX; break; }
      }
      finalMonthOT = Math.min(finalMonthOT, adjustedOT, OT_MONTHLY_MAX);

      // Scenario D: Carry forward
      const carryForward = Math.max(0, adjustedOT - OT_MONTHLY_MAX);
      if (carryForward > 0) {
        const nextM = month === 12 ? 1 : month + 1;
        const nextY = month === 12 ? year + 1 : year;
        await client.query(
          `INSERT INTO ot_carryforward
             (id,employee_id,from_year,from_month,to_year,to_month,carried_hours,balance_hours,finalized_by,finalized_at)
           VALUES (?,?,?,?,?,?,?,?,?,NOW())`,
          [uuid(), emp.id, year, month, nextY, nextM, carryForward, carryForward, req.admin.id]
        );
      }

      results.push({
        employee_id: emp.id,
        raw_ot: parseFloat(totalRawOT.toFixed(2)),
        adjusted_ot: parseFloat(adjustedOT.toFixed(2)),
        payable_ot: parseFloat(finalMonthOT.toFixed(2)),
        carry_forward: parseFloat(carryForward.toFixed(2)),
        absents_converted: absents.length > 1 ? absents.length : 0,
      });
    }

    await client.query(
      `INSERT INTO audit_logs (id,admin_id,action,new_values)
       VALUES (?,?,'MONTH_END_OT_FINALIZE',?)`,
      [uuid(), req.admin.id, JSON.stringify({ year, month, employees_processed: results.length })]
    );

    await client.COMMIT();
    res.json({ message: 'Month-end OT finalized', year, month, results });
  } catch (e) {
    await client.ROLLBACK();
    console.error(e);
    res.status(500).json({ error: e.message });
  } finally { client.release(); }
};

// ── OT Carry Forward List ────────────────────────────────────
const getCarryForward = async (req, res) => {
  const { year, month } = req.query;
  let sql = `SELECT cf.*, e.full_name, e.employee_code FROM ot_carryforward cf
             JOIN employees e ON e.id=cf.employee_id WHERE 1=1`;
  const p = [];
  if (year)  { sql += ' AND cf.from_year=?';  p.push(year); }
  if (month) { sql += ' AND cf.from_month=?'; p.push(month); }
  sql += ' ORDER BY cf.created_at DESC';
  const { rows } = await db.query(sql, p);
  res.json(rows);
};

// ── Monthly OT Summary (checks daily/weekly/monthly limits) ──
const getMonthlyOTSummary = async (req, res) => {
  const { year, month } = req.query;
  const { rows } = await db.query(
    `SELECT e.employee_code, e.full_name, e.department,
            COALESCE(SUM(ot.final_ot),0)  AS total_ot,
            MAX(ot.final_ot)              AS max_day_ot,
            COUNT(ot.id)                  AS ot_days,
            SUM(ot.final_ot > ?)          AS days_exceeded_daily,
            SUM(ot.within_window)         AS valid_window_days,
            SUM(ot.full_shift_done)       AS full_shift_days
     FROM employees e
     LEFT JOIN overtime_adjustments ot ON ot.employee_id=e.id
           AND YEAR(ot.ot_date)=? AND MONTH(ot.ot_date)=?
     WHERE e.status != 'inactive'
     GROUP BY e.id
     ORDER BY total_ot DESC`,
    [OT_DAILY_MAX, year || new Date().getFullYear(), month || new Date().getMonth() + 1]
  );
  res.json({ year, month, limits: { daily: OT_DAILY_MAX, weekly: OT_WEEKLY_MAX, monthly: OT_MONTHLY_MAX }, records: rows });
};

module.exports = { updateOT, finalizeMonthOT, getCarryForward, getMonthlyOTSummary };
