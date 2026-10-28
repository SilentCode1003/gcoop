//database/config/db.js
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

//@ can be used for universal query SELECT, INSERT, UPDATE, DELETE
const Query = async (sql, params = [], prefixes) => {
  try {
    const [result] = await promisePool.query(sql, params);
    if (sql.trim().toUpperCase().startsWith("INSERT")) {
      return { ...result, insertId: result.insertId };
    }
    if (prefixes && sql.trim().toUpperCase().startsWith("SELECT")) {
      const data = DataModeling(result, prefixes);
      return data;
    }
    return result;
  } catch (error) {
    console.error(error);
    console.error("Error executing query:", error);
    throw error;
  }
};

//@use for Transac and Commit
const Transaction = async (queries) => {
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    for (const query of queries) {
      await connection.execute(query.sql, query.values);
    }

    await connection.commit();
    return true;
  } catch (error) {
    console.error("Transaction failed:", error);
    console.log(error);
    if (connection) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error("Rollback failed after transaction error:", rollbackError);
      }
    }
    throw error;
  } finally {
    if (connection) {
      connection.release();
    }
  }
};


module.exports = { pool: promisePool, Query, testConnection };