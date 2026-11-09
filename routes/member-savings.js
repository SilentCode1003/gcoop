var express = require("express");
var router = express.Router();
const { Query } = require("../database/config/db.js");
const {EncryptString, DecryptString} = require("../database/cryptography.js")

router.get("/", (req, res) => {
    res.render("layout/main-layout", {
        body: "../pages/membersavings-page.ejs",
        title: "Member Savings",
        pageStyle: "member-savings.css",
        pageScript: "../scripts/membersavings-script.ejs",
        roleName: req.session.roleName
    });
});


module.exports = router;