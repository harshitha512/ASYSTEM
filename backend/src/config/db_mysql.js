const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host:               process.env.DB_HOST     || 'localhost',
  port:               parseInt(process.env.DB_PORT) || 3306,
  database:           process.env.DB_NAME     || 'attendance_db',
  user:               process.env.DB_USER     || 'root',
  password:           process.env.DB_PASSWORD || '',
  waitForConnections: true,
  connectionLimit:    20,
  queueLimit:         0,
  timezone:           '+00:00',
});

/**
 * Unified query helper — mirrors the pg interface so controllers
 * need no changes: result.rows always contains the data.
 */
const query = async (text, params = []) => {
  // mysql2 uses ? placeholders; convert $1,$2,… → ?
  const sql = text.replace(/\$\d+/g, '?');
  const [rows] = await pool.execute(sql, params);
  return { rows: Array.isArray(rows) ? rows : [rows] };
};

const getClient = async () => {
  const conn = await pool.getConnection();
  return {
    query: async (text, params = []) => {
      const sql = text.replace(/\$\d+/g, '?');
      const [rows] = await conn.execute(sql, params);
      return { rows: Array.isArray(rows) ? rows : [rows] };
    },
    query_raw: (sql, params) => conn.execute(sql, params),
    release: () => conn.release(),
    // Transaction helpers
    BEGIN:    () => conn.beginTransaction(),
    COMMIT:   () => conn.commit(),
    ROLLBACK: () => conn.rollback(),
  };
};

module.exports = { query, getClient, pool };
