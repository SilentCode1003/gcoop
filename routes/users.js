var express = require("express");
var router = express.Router();
const { Query } = require("../database/config/db");
const {EncryptString, DecryptString} = require("./../database/cryptography.js")

function validateUsers(body, ignoreId = null) {
  const fullname = (body.FullName ?? "").trim();
  const role = (body.Role ?? "").trim();
  const username = (body.Username ?? "").trim();
  const password = (body.Password ?? "").trim();

 

  if (!fullname) return { error: "Full name is required." };
  if (!role) return { error: "Role is required." };
  if (!username) return { error: "Username is required." };
  if (!password) return { error: "Password is required." };
  
return { value: { fullname, role, username, password }};

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
 const createUsers = await Query("Insert into master_users (mu_fullname, mu_role, mu_username, mu_password, mu_create_at) values (?,?,?,?,?)", [value.fullname, value.role, value.username, EncryptString(value.password), new Date]);
  res
    .status(201)
    .json({ success: true, message: "User created.", data: createUsers});
});

// Update User
 router.put("/updateUser/:id",async function (req, res) {
   const id = parseInt(req.params.id, 10);

   const { error, value } = validateUsers(req.body, id);
   const updateUsers = await Query("Update master_users set mu_fullname = ?, mu_role = ?, mu_username = ?, mu_password = ?, mu_update_at = ? where mu_id = ?", [value.fullname, value.role, value.username, EncryptString(value.password), new Date(), id]) ;
   if (error) {
     return res.status(400).json({ success: false, message: error });
   }
   res.json({ success: true, message: "User updated.", data: updateUsers });
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