const db = require('../config/db');

const getAll = async (req, res) => {
  const { year } = req.query;
  let sql = 'SELECT * FROM holidays';
  const params = [];
  if (year) { sql += ' WHERE YEAR(holiday_date)=?'; params.push(year); }
  sql += ' ORDER BY holiday_date';
  const { rows } = await db.query(sql, params);
  res.json(rows);
};

const create = async (req, res) => {
  const { holiday_date, description } = req.body;
  try {
    const id = require('uuid').v4();
    await db.query(
      'INSERT INTO holidays (id,holiday_date,description,created_by) VALUES (?,?,?,?)',
      [id, holiday_date, description, req.admin.id]
    );
    res.status(201).json({ id, holiday_date, description });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Holiday already declared for this date' });
    res.status(500).json({ error: e.message });
  }
};

const remove = async (req, res) => {
  await db.query('DELETE FROM holidays WHERE id=?', [req.params.id]);
  res.json({ message: 'Holiday removed' });
};

// Check if a date is a holiday or Sunday
const isHolidayOrSunday = async (dateStr) => {
  const d = new Date(dateStr);
  if (d.getDay() === 0) return true;
  const { rows } = await db.query('SELECT id FROM holidays WHERE holiday_date=?', [dateStr]);
  return rows.length > 0;
};

module.exports = { getAll, create, remove, isHolidayOrSunday };
