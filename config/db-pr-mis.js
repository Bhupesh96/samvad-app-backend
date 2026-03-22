const mariadb = require('mariadb');

const pool = mariadb.createPool({
  // ✅ Replace hardcoded values with process.env variables
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE_PR,
  queueLimit: 0,
  supportBigNumbers: true,
  bigNumberStrings: true,  // 👈 ADD THIS

  connectionLimit: 10,
  acquireTimeout: 20000
});

module.exports = pool;
