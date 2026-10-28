// //@ can be used for universal query SELECT, INSERT, UPDATE, DELETE
// exports.Query = async (sql, params = [], prefixes) => {
//   try {
//     const [result] = await pool.query(sql, params);
//     if (sql.trim().toUpperCase().startsWith("INSERT")) {
//       return { ...result, insertId: result.insertId };
//     }
//     if (prefixes && sql.trim().toUpperCase().startsWith("SELECT")) {
//       const data = DataModeling(result, prefixes);
//       return data;
//     }
//     return result;
//   } catch (error) {
//     logger.error(error);
//     console.error("Error executing query:", error);
//     throw error;
//   }
// };

// //@use for Transac and Commit
// exports.Transaction = async (queries) => {
//   let connection;
//   try {
//     connection = await pool.getConnection();
//     await connection.beginTransaction();

//     for (const query of queries) {
//       await connection.execute(query.sql, query.values);
//     }

//     await connection.commit();
//     return true;
//   } catch (error) {
//     logger.error("Transaction failed:", error);
//     console.log(error);
//     if (connection) {
//       try {
//         await connection.rollback();
//       } catch (rollbackError) {
//         logger.error("Rollback failed after transaction error:", rollbackError);
//       }
//     }
//     throw error;
//   } finally {
//     if (connection) {
//       connection.release();
//     }
//   }
// };
