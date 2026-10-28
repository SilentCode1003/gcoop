var express = require("express");
var router = express.Router();
const {Query} = require("./../database/config/db.js")
const {EncryptString, DecryptString} = require("./../database/cryptography.js")

function validateCredentials(body) {
    const username = (body.username ?? "").trim();
    const password = (body.Password ?? "").trim();

    if (!username) return { error: "Invalid Username, Please try again." };
    if (!password) return { error: "Invalid Password, Please try again." };
    return {
        value: {
            username,
           password
        }
         };
}
function validateRegistree(body) {
    const username = (body.username ?? "").trim();
    const password = (body.Password ?? "").trim();
    const roleId = (body.roleId ?? "").trim();

    if (!username) return { error: "Invalid Username, Please try again." };
    if (!password) return { error: "Invalid Password, Please try again." };
    if (!roleId) return { error: "Invalid roleId, Please try again." };
    return {
        value: {
            username,
            password,
            roleId
        }
         };
}


/* GET home page. */
router.get("/", function (req, res, next) {
  res.render("layout/sub-layout", {
    body: "../pages/login-page.ejs",
    title: "Error",
    pageScript: "../scripts/login-script.ejs",
  });
});

/* POST create a student. */
  router.post("/login", async function (req, res) {
  try {
    const { error, value } = validateCredentials(req.body);
    if (error) {
      return res.status(400).json({ success: false, message: error });
    }

    const [user] = await Query(
      "SELECT u_id, u_roleId, u_userName FROM user WHERE u_userName = ? AND u_hashPassword = ?",
      [value.username, EncryptString(value.password)]
    );

    if (!user) {
      return res.status(401).json({ success: false, message: "Invalid Credentials" });
    }

    req.session.regenerate((err) => {
      if (err) return res.status(500).json({ success: false, message: "Session error" });

      req.session.userId = user.u_id;
      req.session.roleId = user.u_roleId;
      req.session.username = user.u_userName;

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

  router.post("/logout", async function (req,res){
    req.session.destroy((err) => {
        if (err){
            console.error('Cannot destroy session')
        }
        res.sendStatus(204)
    })
  })
  router.post("/register", async function (req, res) {
      const { error, value } = validateRegistree(req.body);
      console.log(value);
      if (error) {
        return res.status(400).json({ success: false, message: error });
      }
    const createData = await Query("Insert into user (u_roleId, u_userName, u_hashPassword, u_createdDate, u_updatedDate) values (?,?,?,?,?)",[value.roleId, value.username, EncryptString(value.password), new Date(), new Date(), ]);
      res
        .status(201)
        .json({ success: true, message: "Section created.", data: createData });
    });

module.exports = router;
