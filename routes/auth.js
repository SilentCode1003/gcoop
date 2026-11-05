var express = require("express");
var router = express.Router();
const { Query } = require("./../database/config/db.js");
const { EncryptString, DecryptString } = require("./../database/cryptography.js");

const normalize = (s) => String(s ?? "").toLowerCase().replace(/[\s\-_]+/g, "");

// For Login
function validateCredentials(body) {
  const username = (body.Username ?? body.username ?? "").toString().trim();
  const password = (body.Password ?? body.password ?? "").toString().trim();

  if (!username) return { error: "Invalid username, please try again." };
  if (!password) return { error: "Invalid Password, please try again" };

  return { value: { username, password } };
}

// Roles + role_permission + routes -> { roleName, permissions: { members: "write", ... } }
async function loadAccess(roleId) {
  const rows = await Query(
    `SELECT ro.mr_name       AS role_name,
            rt.mr_name       AS route_name,
            p.mrp_permission AS permission
     FROM master_roles ro
     LEFT JOIN master_role_permission p ON p.mrp_role_id = ro.mr_id
     LEFT JOIN master_routes rt         ON rt.mr_id = p.mrp_route_id
     WHERE ro.mr_id = ?`,
    [roleId]
  );

  const permissions = {};
  for (const r of rows) {
    if (r.route_name) permissions[normalize(r.route_name)] = r.permission;
  }

  return { roleName: rows[0]?.role_name ?? "", permissions };
}

/* GET home page. */
router.get("/", function (req, res, next) {
  res.render("layout/sub-layout", {
    body: "../pages/login-page.ejs",
    title: "5L | COOP",
    pageStyle: "../stylesheets/login.css",
    pageScript: "../scripts/login-script.ejs",
  });
});

router.post("/login", async function (req, res) {
  try {
    const { error, value } = validateCredentials(req.body);
    if (error) {
      return res.status(400).json({ success: false, message: error });
    }

    const [user] = await Query(
      "SELECT mu_id, mu_role, mu_username FROM master_users WHERE mu_username = ? AND mu_password = ?",
      [value.username, EncryptString(value.password)]
    );

    if (!user) {
      return res.status(401).json({ success: false, message: "Invalid Credentials" });
    }

    // Load the role's permissions BEFORE regenerate (it uses a callback)
    const access = await loadAccess(user.mu_role);

    req.session.regenerate((err) => {
      if (err) return res.status(500).json({ success: false, message: "Session error" });

      req.session.userId = user.mu_id;
      req.session.role = user.mu_role;
      req.session.roleName = access.roleName;
      req.session.permissions = access.permissions;
      req.session.username = user.mu_username;

      req.session.save((err) => {
        if (err) return res.status(500).json({ success: false, message: "Session error" });
        res.status(200).json({ success: true, message: "Logged in." });
      });
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Re-read the role's permissions without logging in again
router.get("/refresh", async function (req, res) {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ success: false, message: "Please log in again." });
    }

    const access = await loadAccess(req.session.role);
    req.session.roleName = access.roleName;
    req.session.permissions = access.permissions;

    req.session.save(() => res.json({ success: true, permissions: access.permissions }));
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.post("/logout", async function (req, res) {
  req.session.destroy((err) => {
    if (err) {
      console.error("Cannot destroy session");
    }

    res.sendStatus(204);
  });
});

module.exports = router;