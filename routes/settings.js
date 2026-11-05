var express = require("express");
var router = express.Router();

// Settings Page
router.get("/", function (req, res) {
  res.render("layout/main-layout", {
    body: "../pages/settings-page.ejs",
    title: "Settings",
    pageStyle: "../stylesheets/settings.css",
    pageScript: "../scripts/settings-script.ejs",
  });
});

module.exports = router;