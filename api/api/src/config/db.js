const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
  host:     process.env.DB_HOST,
  port:     process.env.DB_PORT,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  charset: 'utf8mb4',
  dateStrings: ['DATE'], // évite le décalage d'un jour dû au fuseau horaire sur les colonnes DATE
});

pool.getConnection()
  .then(conn => { console.log('MariaDB connecté'); conn.release(); })
  .catch(err => { console.error('Erreur DB:', err.message); process.exit(1); });

module.exports = pool;
