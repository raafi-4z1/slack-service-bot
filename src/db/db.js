const mysql = require("mysql2/promise");
const logger = require("../core/logger");
const config = require("../core/config");

const pool = mysql.createPool({
  host: config.DB_HOST,
  user: config.DB_USER,
  password: config.DB_PASSWORD,
  port: config.DB_PORT,
  database: config.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
});

(async () => {
  try {
    const conn = await pool.getConnection();
    await conn.ping();
    conn.release();
    logger.info("📡 Database connected successfully");
  } catch (err) {
    logger.error("❌ Database connection failed", { error: err });
  }
})();

module.exports = pool;
