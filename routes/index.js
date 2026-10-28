var express = require("express");
var router = express.Router();

/* GET home page. */
router.get("/", function (req, res, next) {
  res.render("layout/main-layout", {
    body: "../pages/dashboard-page.ejs",
    title: "5L Solutions Coop",
    pageScript: "../scripts/dashboard-script.ejs",
  });
});

module.exports = router;

