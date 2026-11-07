var express = require("express");
var router = express.Router();
const { Query } = require("../database/config/db.js");
const {EncryptString, DecryptString} = require("../database/cryptography.js")

router.get("/", (req, res) => {
    res.render("layout/main-layout", {
        body: "../pages/savingsledger-page.ejs",
        title: "Roles",
        pageScript: "../scripts/savingsledger-script.ejs",
        roleName: req.session.roleName
    });
});


module.exports = router;