var express = require("express");
var router = express.Router();
const { Query } = require("../database/config/db");

function validateMembers(body, ignoreId = null) {
  const employeeId = (body.EmployeeId ?? "").trim();
  const fullName = (body.FullName ?? "").trim();
  const address = (body.Address ?? "").trim();
  const contact = (body.Contact ?? "").trim();
  const registerBy = (body.RegisteredBy ?? "").trim();
 

  if (!employeeId) return { error: "First Name is required." };
  if (!fullName) return { error: "Middle Name is required." };
  if (!address) return { error: "Last Name is required." };
  if (!contact) return { error: "Status is required." };
  if (!registerBy) return { error: "Section Name is required." };
  
return { value: { employeeId, fullName, address, contact, registerBy }};

}

// Member Page
router.get("/", function (req, res) {
  res.render("layout/main-layout", {
    body: "../pages/members-page.ejs",
    title: "Members",
    pageStyle: "/stylesheets/dashboard.css",
    pageScript: "../scripts/members-script.ejs",
  });
});

// Load Members
router.get("/loadMember",async function(req,res){
    const data = await Query("SELECT mm_id AS id, mm_employee_id AS employeeId, mm_fullname AS fullName, mm_address AS address, mm_contact_no AS contact, mm_register_date AS registeredDate, mm_register_by AS registeredBy FROM master_members ORDER BY mm_fullname ASC")
    console.log(data)
    res.json(data)
});

// Create Member
router.post("/createMember",async function (req, res) {
  const { error, value } = validateMembers(req.body);
  if (error) {
    return res.status(400).json({ success: false, message: error });
  }
 const createMember = await Query("Insert into master_members (mm_employee_id, mm_fullname, mm_address, mm_contact_no, mm_register_date, mm_register_by) values (?,?,?,?,?,?)", [value.employeeId, value.fullName, value.address, value.contact, new Date(), value.registerBy]);
  res
    .status(201)
    .json({ success: true, message: "Member created.", data: createMember});
});

// Update Member
 router.put("/updateMember/:id",async function (req, res) {
   const id = parseInt(req.params.id, 10);

   const { error, value } = validateMembers(req.body, id);
   const updateMembers = await Query("Update master_members set mm_employee_id = ?, mm_fullname = ?, mm_address = ?, mm_contact_no = ?, mm_register_by = ? where mm_id = ?", [value.employeeId, value.fullName, value.address, value.contact, value.registerBy, id]) ;
   if (error) {
     return res.status(400).json({ success: false, message: error });
   }
   res.json({ success: true, message: "Member updated.", data: updateMembers });
 });

// Delete Member
router.delete("/deleteMember/:id", async function (req, res) {
  const id = parseInt(req.params.id, 10);

  if (id.length === 0) {
    return res
      .status(404)
      .json({ success: false, message: "Student not found." });
  }

  const deleteMember = await Query("Delete from master_members where mm_id = ?", [id]);
 

  res.json({ success: true, message: "Member deleted.", data : deleteMember});
});

module.exports = router;