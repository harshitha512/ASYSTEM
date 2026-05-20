const db = require('../config/db');

const getAll = async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM shifts ORDER BY shift_name');
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
};

const create = async (req, res) => {
  const { shift_name, start_time, end_time, in_early, in_late,
          out_early, out_late, ot_window_start, ot_window_end, is_night_shift } = req.body;
  try {
    const id = require('uuid').v4();
    await db.query(
      `INSERT INTO shifts (id,shift_name,start_time,end_time,in_early,in_late,out_early,out_late,ot_window_start,ot_window_end,is_night_shift)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [id, shift_name, start_time, end_time, in_early, in_late, out_early, out_late, ot_window_start, ot_window_end, is_night_shift ? 1 : 0]
    );
    const { rows } = await db.query('SELECT * FROM shifts WHERE id=?', [id]);
    res.status(201).json(rows[0]);
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Shift name already exists' });
    res.status(500).json({ error: e.message });
  }
};

const update = async (req, res) => {
  const { shift_name, start_time, end_time, in_early, in_late,
          out_early, out_late, ot_window_start, ot_window_end, is_night_shift, is_active } = req.body;
  try {
    await db.query(
      `UPDATE shifts SET shift_name=?,start_time=?,end_time=?,in_early=?,in_late=?,
       out_early=?,out_late=?,ot_window_start=?,ot_window_end=?,is_night_shift=?,is_active=?
       WHERE id=?`,
      [shift_name, start_time, end_time, in_early, in_late,
       out_early, out_late, ot_window_start, ot_window_end,
       is_night_shift ? 1 : 0, is_active ? 1 : 0, req.params.id]
    );
    const { rows } = await db.query('SELECT * FROM shifts WHERE id=?', [req.params.id]);
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
};

const remove = async (req, res) => {
  try {
    await db.query('UPDATE shifts SET is_active=0 WHERE id=?', [req.params.id]);
    res.json({ message: 'Shift deactivated' });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

module.exports = { getAll, create, update, remove };
