const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');

const login = async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

  try {
    const result = await db.query('SELECT * FROM admins WHERE username = $1', [username]);
    if (result.rows.length === 0) return res.status(401).json({ error: 'Invalid credentials' });

    const admin = result.rows[0];
    const valid = await bcrypt.compare(password, admin.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign(
      { id: admin.id, username: admin.username, full_name: admin.full_name },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
    );

    res.json({ token, admin: { id: admin.id, username: admin.username, full_name: admin.full_name } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

const changePassword = async (req, res) => {
  const { old_password, new_password } = req.body;
  try {
    const result = await db.query('SELECT * FROM admins WHERE id = $1', [req.admin.id]);
    const admin = result.rows[0];
    const valid = await bcrypt.compare(old_password, admin.password_hash);
    if (!valid) return res.status(401).json({ error: 'Old password incorrect' });

    const hash = await bcrypt.hash(new_password, 10);
    await db.query('UPDATE admins SET password_hash = $1, updated_at = NOW() WHERE id = $2', [hash, req.admin.id]);
    res.json({ message: 'Password updated successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { login, changePassword };
