var express = require("express");
var router = express.Router();
const { Query } = require("../database/config/db");
const { EncryptString } = require("./../database/cryptography.js");

// Profile Page
router.get("/", function (req, res) {
  res.render("layout/main-layout", {
    body: "../pages/profile-page.ejs",
    title: "Profile",
    pageStyle: "profile.css",
    pageScript: "../scripts/profile-script.ejs",
  });
});

// Load Profile (the logged-in user only)
router.get("/load-profile", async (req, res) => {
  try {
    const [profile] = await Query(
      `SELECT u.mu_id        AS id,
              u.mu_fullname  AS fullName,
              u.mu_username  AS username,
              ro.mr_name     AS role,
              u.mu_create_at AS createdDate,
              u.mu_update_at AS updatedDate
       FROM master_users u
       LEFT JOIN master_roles ro ON ro.mr_id = u.mu_role
       WHERE u.mu_id = ?`,
      [req.session.userId]
    );

    if (!profile) {
      return res.status(404).json({ success: false, message: "Profile not found." });
    }

    res.json(profile);
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Failed to load profile." });
  }
});

// Update Profile (own record only)
router.put("/update-profile", async (req, res) => {
  try {
    const fullName = String(req.body.FullName ?? "").trim();
    const username = String(req.body.Username ?? "").trim();
    const currentPassword = String(req.body.CurrentPassword ?? "").trim();
    const newPassword = String(req.body.NewPassword ?? "").trim();

    if (!fullName) {
      return res.status(400).json({ success: false, message: "Full name is required." });
    }
    if (!username) {
      return res.status(400).json({ success: false, message: "Username is required." });
    }

    // Username must be unique
    const taken = await Query(
      "SELECT mu_id FROM master_users WHERE mu_username = ? AND mu_id <> ?",
      [username, req.session.userId]
    );
    if (taken.length > 0) {
      return res.status(409).json({ success: false, message: "That username is already taken." });
    }

    if (newPassword) {
      if (!currentPassword) {
        return res.status(400).json({ success: false, message: "Enter your current password to set a new one." });
      }
      if (newPassword.length < 6) {
        return res.status(400).json({ success: false, message: "New password must be at least 6 characters." });
      }

      const [match] = await Query(
        "SELECT mu_id FROM master_users WHERE mu_id = ? AND mu_password = ?",
        [req.session.userId, EncryptString(currentPassword)]
      );
      if (!match) {
        return res.status(400).json({ success: false, message: "Current password is incorrect." });
      }

      await Query(
        "UPDATE master_users SET mu_fullname = ?, mu_username = ?, mu_password = ?, mu_update_at = ? WHERE mu_id = ?",
        [fullName, username, EncryptString(newPassword), new Date(), req.session.userId]
      );
    } else {
      await Query(
        "UPDATE master_users SET mu_fullname = ?, mu_username = ?, mu_update_at = ? WHERE mu_id = ?",
        [fullName, username, new Date(), req.session.userId]
      );
    }

    req.session.username = username;

    res.json({ success: true, message: "Profile updated." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Failed to update profile." });
  }
});

module.exports = router;