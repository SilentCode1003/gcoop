var express = require("express");
var router = express.Router();
const { Query } = require("../database/config/db");

// ===============================
// User Page
// ===============================
router.get("/", function (req, res) {
  res.render("layout/main-layout", {
    body: "../pages/users-page.ejs",
    title: "User Accounts",
    pageScript: "../scripts/users-script.ejs",
  });
});

// ===============================
// Load Users
// ===============================
router.get("/load", async function (req, res) {
  try {
    const data = await Query(`
      SELECT
        u.mu_id AS id,
        u.mu_fullname AS fullname,
        u.mu_role AS roleid,
        r.mr_name AS role,
        u.mu_username AS username,
        u.mu_create_at AS createdat,
        u.mu_update_at AS updatedat
      FROM master_users u
      LEFT JOIN master_role r
        ON u.mu_role = r.mr_id
      ORDER BY u.mu_id DESC
    `);

    res.json(data);

  } catch (err) {

    console.log(err);

    res.status(500).json({
      success: false,
      message: "Unable to load users."
    });

  }
});

// ===============================
// Load Roles
// ===============================
router.get("/roles", async function (req, res) {

  try {

    const roles = await Query(`
      SELECT
        mr_id AS id,
        mr_name AS name
      FROM master_role
      ORDER BY mr_name
    `);

    res.json(roles);

  } catch (err) {

    console.log(err);

    res.status(500).json({
      success: false,
      message: "Unable to load roles."
    });

  }

});

// ===============================
// Create User
// ===============================
router.post("/create", async function (req, res) {

  try {

    const body = req.body;

    await Query(`
      INSERT INTO master_users
      (
        mu_fullname,
        mu_role,
        mu_username,
        mu_password,
        mu_create_at
      )
      VALUES (?,?,?,?,?)
    `,
    [
      body.FullName,
      body.Role,
      body.Username,
      body.Password,
      new Date()
    ]);

    res.json({
      success: true,
      message: "User successfully created."
    });

  } catch (err) {

    console.log(err);

    res.status(500).json({
      success: false,
      message: "Unable to create user."
    });

  }

});

// ===============================
// Update User
// ===============================
router.put("/update/:id", async function (req, res) {

  try {

    const id = parseInt(req.params.id);
    const body = req.body;

    if (body.Password && body.Password.trim() !== "") {

      await Query(`
        UPDATE master_users
        SET
          mu_fullname=?,
          mu_role=?,
          mu_username=?,
          mu_password=?,
          mu_update_at=?
        WHERE mu_id=?
      `,
      [
        body.FullName,
        body.Role,
        body.Username,
        body.Password,
        new Date(),
        id
      ]);

    } else {

      await Query(`
        UPDATE master_users
        SET
          mu_fullname=?,
          mu_role=?,
          mu_username=?,
          mu_update_at=?
        WHERE mu_id=?
      `,
      [
        body.FullName,
        body.Role,
        body.Username,
        new Date(),
        id
      ]);

    }

    res.json({
      success: true,
      message: "User updated successfully."
    });

  } catch (err) {

    console.log(err);

    res.status(500).json({
      success: false,
      message: "Unable to update user."
    });

  }

});

// ===============================
// Delete User
// ===============================
router.delete("/delete/:id", async function (req, res) {

  try {

    await Query(
      "DELETE FROM master_users WHERE mu_id=?",
      [req.params.id]
    );

    res.json({
      success: true,
      message: "User deleted successfully."
    });

  } catch (err) {

    console.log(err);

    res.status(500).json({
      success: false,
      message: "Unable to delete user."
    });

  }

});

module.exports = router;