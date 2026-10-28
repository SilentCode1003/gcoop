var express = require("express");
var router = express.Router();
const { Query } = require("../database/config/db");

// Member Page
router.get("/", function (req, res) {
  res.render("layout/main-layout", {
    body: "../pages/members-page.ejs",
    title: "Members",
    pageScript: "../scripts/members-script.ejs",
  });
});

// Load Members
router.get("/load", async function (req, res) {
  try {
    const data = await Query(`
SELECT
    mm_id AS id,
    mm_employee_id AS employeeId,
    mm_fullname AS fullName,
    mm_address AS address,
    mm_contact_no AS contact,
    mm_register_date AS registeredDate,
    mm_register_by AS registeredBy
FROM master_members
ORDER BY mm_id DESC
`);

    res.json(data);
  } catch (err) {
    console.log(err);

    res.status(500).json({
      success: false,
      message: "Unable to load members."
    });
  }
});

// Create Member
router.post("/create", async function (req, res) {
  try {

    const body = req.body;

    await Query(`
INSERT INTO master_members
(
    mm_employee_id,
    mm_fullname,
    mm_address,
    mm_contact_no,
    mm_register_date,
    mm_register_by
)
VALUES (?,?,?,?,?,?)
`, [
    body.EmployeeId,
    body.FullName,
    body.Address,
    body.Contact,
    new Date(),
    body.RegisteredBy
]);

    res.json({
      success: true,
      message: "Member successfully created."
    });

  } catch(err){

    console.log(err);

    res.status(500).json({
      success:false,
      message:"Unable to create member."
    });

  }
});

// Update Member
router.put("/update/:id", async function(req,res){

    try{

        const id=parseInt(req.params.id);

        const body=req.body;

        await Query(`
            UPDATE master_members
            SET
                mm_employee_id=?,
                mm_fullname=?,
                mm_address=?,
                mm_contact_no=?,
                mm_register_by=?
            WHERE mm_id=?
        `,[
            body.EmployeeID,
            body.FullName,
            body.Address,
            body.ContactNo,
            body.RegisterBy,
            id
        ]);

        res.json({
            success:true,
            message:"Member updated."
        });

    }catch(err){

        console.log(err);

        res.status(500).json({
            success:false,
            message:"Unable to update."
        });

    }

});

// Delete Member
router.delete("/delete/:id",async function(req,res){

    try{

        await Query(
            "DELETE FROM master_members WHERE mm_id=?",
            [req.params.id]
        );

        res.json({
            success:true,
            message:"Member deleted."
        });

    }catch(err){

        console.log(err);

        res.status(500).json({
            success:false,
            message:"Unable to delete."
        });

    }

});

module.exports = router;