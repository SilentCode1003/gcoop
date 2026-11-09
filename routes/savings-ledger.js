var express = require("express");
var router = express.Router();

const { Query } = require("../database/config/db");

// ==========================
// PAGE
// ==========================

router.get("/", (req, res) => {
    res.render("layout/main-layout", {
        body: "../pages/savingsledger-page.ejs",
        title: "Savings Ledger",
        pageStyle: "savings-ledger.css",
        pageScript: "../scripts/savingsledger-script.ejs",
        roleName: req.session.roleName
    });
});


module.exports = router;