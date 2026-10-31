var express = require("express");
var router = express.Router();
const { Query } = require("../database/config/db");
const {EncryptString, DecryptString} = require("./../database/cryptography.js")

function validateUsers(body, { requirePassword = true } = {}) {
  const fullName = String(body.FullName ?? "").trim();
  const role = String(body.Role ?? "").trim();
  const username = String(body.Username ?? "").trim();
  const password = String(body.Password ?? "").trim();

  if (!fullName) return { error: "Full name is required." };
  if (!role) return { error: "Role is required." };
  if (!username) return { error: "Username is required." };
  if (requirePassword && !password) return { error: "Password is required." };

  return { value: { fullName, role, username, password } };
}

// User Page
router.get("/", function (req, res) {
  res.render("layout/main-layout", {
    body: "../pages/users-page.ejs",
    title: "User Accounts",
    pageStyle: "../stylesheets/users.css",
    pageScript: "../scripts/users-script.ejs",
  });
});

// Load Users
router.get("/loadUser",async function(req,res){
    const data = await Query("SELECT u.mu_id AS id, u.mu_fullname AS fullname, u.mu_role AS roleid, r.mr_name AS role, u.mu_username AS username, u.mu_create_at AS createdat, u.mu_update_at AS updatedat FROM master_users u LEFT JOIN master_roles r ON u.mu_role = r.mr_id ORDER BY u.mu_id DESC")
console.log(data)
    res.json(data)
});

// Load Roles in Modal
router.get("/insertRole", async function (req, res) {
    const roles = await Query("SELECT mr_id AS id, mr_name AS name FROM master_roles ORDER BY mr_name");
    console.log(roles)
    res.json(roles);
});

// Create User
router.post("/createUser",async function (req, res) {
  const { error, value } = validateUsers(req.body);
  if (error) {
    return res.status(400).json({ success: false, message: error });
  }
 const createUsers = await Query("Insert into master_users (mu_fullname, mu_role, mu_username, mu_password, mu_create_at) values (?,?,?,?,?)", [value.fullName, value.role, value.username, EncryptString(value.password), new Date]);
  res
    .status(201)
    .json({ success: true, message: "User created.", data: createUsers});
});

// Update User
 router.put("/updateUser/:id", async function (req, res) {
  try {
    const id = parseInt(req.params.id, 10);

    // password is optional when updating
    const { error, value } = validateUsers(req.body, { requirePassword: false });
    if (error) {
      return res.status(400).json({ success: false, message: error });
    }

    let result;
    if (value.password) {
      // password was typed -> update it too
      result = await Query(
        "UPDATE master_users SET mu_fullname = ?, mu_role = ?, mu_username = ?, mu_password = ?, mu_update_at = ? WHERE mu_id = ?",
        [value.fullName, value.role, value.username, EncryptString(value.password), new Date(), id],
      );
    } else {
      // password left blank -> keep the existing one
      result = await Query(
        "UPDATE master_users SET mu_fullname = ?, mu_role = ?, mu_username = ?, mu_update_at = ? WHERE mu_id = ?",
        [value.fullName, value.role, value.username, new Date(), id],
      );
    }

    res.json({ success: true, message: "User updated.", data: result });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server error." });
  }
});

// Delete User
router.delete("/deleteUser/:id", async function (req, res) {
  const id = parseInt(req.params.id, 10);

  if (id.length === 0) {
    return res
      .status(404)
      .json({ success: false, message: "User not found." });
  }

  const deleteUsers = await Query("Delete from master_users where mu_id = ?", [id]);
 

  res.json({ success: true, message: "User deleted.", data : deleteUsers});
});

module.exports = router;