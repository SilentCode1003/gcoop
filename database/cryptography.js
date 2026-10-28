// require("dotenv").config();

// /**
//  * Encryption Salt
//  */
// const crypto = require("crypto");

// /**
//  * Encryption Algorithm
//  */
// const algorithm = process.env._ENCRYPTION_ALGORITHM;
// const initVector = Buffer.alloc(16, process.env._ENCRYPTION_IV);
// const Securitykey = Buffer.alloc(32, process.env._ENCRYPTION_KEY);

// exports.DecryptString = (hash) => {
//   try {
//     let decipher = crypto.createDecipheriv(algorithm, Securitykey, initVector);
//     let decryptedData = decipher.update(hash, "hex", "utf8");
//     decryptedData += decipher.final("utf-8");

//     return decryptedData;
//   } catch (error) {
//     console.log("Invalid Encrypted Key:", error);
//   }
// };

// exports.EncryptString = (password) => {
//   try {
//     let cipher = crypto.createCipheriv(algorithm, Securitykey, initVector);
//     let encryptedData = cipher.update(password, "utf-8", "hex");
//     encryptedData += cipher.final("hex");

//     return encryptedData;
//   } catch (error) {
//     throw error;
//   }
// };

// function Main() {
//   const args = process.argv.slice(2);

//   if (args.length < 2) {
//     console.log(`
//       Usage:
//         node src/util/cryptography.util.js encrypt "text to encrypt"
//         node src/util/cryptography.util.js decrypt "hash to decrypt"
        
//       Example:
//         node src/util/cryptography.util.js encrypt "myPassword123"
//         node src/util/cryptography.util.js decrypt "a1b2c3d4e5f6..."
//     `);
//     return;
//   }

//   const operation = args[0];
//   const input = args[1];

//   if (operation === "encrypt") {
//     try {
//       const result = exports.EncryptString(input);
//       console.log("Encrypted:", result);
//     } catch (error) {
//       console.log("Encryption failed:", error.message);
//     }
//   } else if (operation === "decrypt") {
//     const result = exports.DecryptString(input);
//     if (result !== null) {
//       console.log("Decrypted:", result);
//     } else {
//       console.log("Decryption failed");
//     }
//   } else {
//     console.log('Invalid operation. Use "encrypt" or "decrypt"');
//   }
// }

// if (require.main === module) {
//   Main();
// }
