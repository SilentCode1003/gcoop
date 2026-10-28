require("dotenv").config();
const mysql = require("mysql2");

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// Promise-based API so you can use async/await
const promisePool = pool.promise();

//@ universal query: SELECT, INSERT, UPDATE, DELETE
const Query = async (sql, params = [], prefixes) => {
  try {
    const [result] = await promisePool.query(sql, params);
    const type = sql.trim().toUpperCase();

    if (type.startsWith("INSERT")) {
      return { ...result, insertId: result.insertId };
    }
    if (prefixes && type.startsWith("SELECT")) {
      return DataModeling(result, prefixes);
    }
    return result;
  } catch (error) {
    console.error("Error executing query:", error);
    throw error;
  }
};

// Call once at startup to catch bad credentials early
const testConnection = async () => {
  const conn = await promisePool.getConnection();
  try {
    await conn.ping();
    console.log("✅ Database connected");
  } finally {
    conn.release();
  }
};

module.exports = { pool: promisePool, Query, testConnection };