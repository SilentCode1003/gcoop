var express = require("express");
var router = express.Router();
const {Query} = require("./../database/config/db.js")
const {EncryptString, DecryptString} = require("./../database/cryptography.js")

// For Login
function validateCredentials(body, ignoreId = null) {
  const username = (body.Username ?? "").trim();
  const password = (body.Password ?? "").trim();


  if (!username) return { error: "Invalid username, please try again." };
  if (!password) return { error : "Invalid Password, please try again"}

  return {value :{username, password}}
}

/* GET home page. */
router.get("/", function (req, res, next) {
  res.render("layout/sub-layout", {
    body: "../pages/login-page.ejs",
    title: "5L | COOP",
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

    req.session.regenerate((err) => {
      if (err) return res.status(500).json({ success: false, message: "Session error" });

      req.session.userId = user.mu_id;
      req.session.role = user.mu_role;
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

router.post("/logout", async function (req, res) {
  req.session.destroy((err) => {
    if (err) {
      console.error('Cannot destroy session')
    }

    res.sendStatus(204)
  })

})

module.exports = router;