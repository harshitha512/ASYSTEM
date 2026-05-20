const express = require('express');
const router  = express.Router();
const { pool: db } = require('../config/db');
const ExcelJS = require('exceljs');

// GET /leaves
router.get('/', async (req, res) => {
  try {
    const { leave_type, status, month, year } = req.query;

    let sql = `
      SELECT
        l.id, l.employee_id, e.employee_code, e.full_name, e.department,
        l.leave_type,
        DATE_FORMAT(l.start_date, '%Y-%m-%d') AS start_date,
        DATE_FORMAT(l.end_date,   '%Y-%m-%d') AS end_date,
        l.days_count, l.reason, l.status, l.created_at
      FROM leaves l
      JOIN employees e ON e.id = l.employee_id
      WHERE 1=1
    `;
    const params = [];

    if (leave_type) { sql += ` AND l.leave_type = ?`;        params.push(leave_type); }
    if (status)     { sql += ` AND l.status = ?`;            params.push(status); }
    if (month)      { sql += ` AND MONTH(l.start_date) = ?`; params.push(month); }
    if (year)       { sql += ` AND YEAR(l.start_date) = ?`;  params.push(year); }

    sql += ` ORDER BY l.start_date DESC`;

    const [rows] = await db.query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch leaves' });
  }
});

// POST /leaves
router.post('/', async (req, res) => {
  try {
    const { employee_id, leave_type, start_date, end_date, reason, status } = req.body;

    if (!employee_id || !leave_type || !start_date) {
      return res.status(400).json({ error: 'employee_id, leave_type and start_date are required' });
    }

    const start    = new Date(start_date);
    const end      = end_date ? new Date(end_date) : new Date(start_date);
    const msPerDay = 1000 * 60 * 60 * 24;
    const days     = Math.round((end - start) / msPerDay) + 1;

    const [result] = await db.query(
      `INSERT INTO leaves (employee_id, leave_type, start_date, end_date, days_count, reason, status)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [employee_id, leave_type, start_date, end_date || start_date, days, reason || '', status || 'pending']
    );

    res.json({ id: result.insertId, message: 'Leave created' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create leave' });
  }
});

// PUT /leaves/:id/status
router.put('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const { id }     = req.params;

    if (!['approved', 'rejected', 'pending'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    await db.query(`UPDATE leaves SET status = ? WHERE id = ?`, [status, id]);
    res.json({ message: `Leave ${status}` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update status' });
  }
});

// GET /leaves/summary
router.get('/summary', async (req, res) => {
  try {
    const { month, year } = req.query;
    const m = month || new Date().getMonth() + 1;
    const y = year  || new Date().getFullYear();

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM leaves
       WHERE MONTH(start_date) = ? AND YEAR(start_date) = ?`,
      [m, y]
    );

    const [typeRows] = await db.query(
      `SELECT leave_type, COUNT(*) AS count
       FROM leaves
       WHERE MONTH(start_date) = ? AND YEAR(start_date) = ?
       GROUP BY leave_type`,
      [m, y]
    );

    const byType = await Promise.all(typeRows.map(async (row) => {
      const [reasonRows] = await db.query(
        `SELECT reason, COUNT(*) AS cnt
         FROM leaves
         WHERE leave_type = ?
           AND MONTH(start_date) = ?
           AND YEAR(start_date) = ?
           AND reason IS NOT NULL AND reason != ''
         GROUP BY reason
         ORDER BY cnt DESC
         LIMIT 3`,
        [row.leave_type, m, y]
      );
      return {
        leave_type:  row.leave_type,
        count:       row.count,
        top_reasons: reasonRows.map(r => r.reason),
      };
    }));

    const workingDays = 26;

    const [empRows] = await db.query(
      `SELECT
        e.employee_code, e.full_name, e.department,
        SUM(CASE WHEN l.leave_type = 'leave'         THEN l.days_count ELSE 0 END) AS leave_count,
        SUM(CASE WHEN l.leave_type = 'absent'        THEN l.days_count ELSE 0 END) AS absent_count,
        SUM(CASE WHEN l.leave_type = 'special_leave' THEN l.days_count ELSE 0 END) AS special_leave_count,
        SUM(CASE WHEN l.leave_type = 'maternity'     THEN l.days_count ELSE 0 END) AS maternity_count,
        SUM(l.days_count) AS total_days
       FROM leaves l
       JOIN employees e ON e.id = l.employee_id
       WHERE MONTH(l.start_date) = ? AND YEAR(l.start_date) = ?
       GROUP BY l.employee_id, e.employee_code, e.full_name, e.department
       ORDER BY total_days DESC
       LIMIT 20`,
      [m, y]
    );

    const byEmployee = empRows.map(e => ({
      ...e,
      month_pct: Math.round((e.total_days / workingDays) * 100),
    }));

    res.json({ total, by_type: byType, by_employee: byEmployee });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch summary' });
  }
});

// GET /leaves/export
router.get('/export', async (req, res) => {
  try {
    const { month, year, leave_type } = req.query;
    const m = month || new Date().getMonth() + 1;
    const y = year  || new Date().getFullYear();

    let sql = `
      SELECT
        e.employee_code, e.full_name, e.department, l.leave_type,
        DATE_FORMAT(l.start_date, '%Y-%m-%d') AS start_date,
        DATE_FORMAT(l.end_date,   '%Y-%m-%d') AS end_date,
        l.days_count, l.reason, l.status
      FROM leaves l
      JOIN employees e ON e.id = l.employee_id
      WHERE MONTH(l.start_date) = ? AND YEAR(l.start_date) = ?
    `;
    const params = [m, y];
    if (leave_type) { sql += ` AND l.leave_type = ?`; params.push(leave_type); }
    sql += ` ORDER BY l.start_date DESC`;

    const [rows] = await db.query(sql, params);

    const workbook  = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Leave Report');

    worksheet.columns = [
      { header: 'Emp Code',   key: 'employee_code', width: 14 },
      { header: 'Name',       key: 'full_name',     width: 24 },
      { header: 'Department', key: 'department',    width: 18 },
      { header: 'Leave Type', key: 'leave_type',    width: 20 },
      { header: 'Start Date', key: 'start_date',    width: 14 },
      { header: 'End Date',   key: 'end_date',      width: 14 },
      { header: 'Days',       key: 'days_count',    width: 8  },
      { header: 'Reason',     key: 'reason',        width: 30 },
      { header: 'Status',     key: 'status',        width: 12 },
    ];

    worksheet.getRow(1).eachCell(cell => {
      cell.font      = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });

    rows.forEach(row => worksheet.addRow(row));

    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const statusCell = row.getCell('status');
      if (statusCell.value === 'approved') statusCell.font = { color: { argb: 'FF16A34A' }, bold: true };
      if (statusCell.value === 'rejected') statusCell.font = { color: { argb: 'FFDC2626' }, bold: true };
      if (statusCell.value === 'pending')  statusCell.font = { color: { argb: 'FFD97706' }, bold: true };
    });

    const months   = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const filename = `Leave_Report_${months[m-1]}_${y}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Export failed' });
  }
});

module.exports = router;