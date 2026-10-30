const express = require("express");
const router = express.Router();
const { Query } = require("../database/config/db.js");


function validateRoles(body) {
 const roleName = (body.Name ?? "").trim();
 
 if (!roleName) return { error : "Invalid Password, please try again"}

  return {value :{roleName}}
}

router.get("/", (req, res) => {
    res.render("layout/main-layout", {
        body: "../pages/roles-page.ejs",
        title: "Roles",
        pageScript: "../scripts/roles-script.ejs"
    });
});

/// Load Roles
router.get("/loadRole",async function(req,res){
    const roles = await Query("SELECT mr_id as id, mr_name as name, mr_create_at as createdDate, mr_update_at as updatedDate FROM master_roles ORDER BY mr_id ASC")
    console.log(roles)
    res.json(roles)
});

// Create Roles
router.post("/createRole",async function (req, res) {
  const { error, value } = validateRoles(req.body);
  if (error) {
    return res.status(400).json({ success: false, message: error });
  }
 const createRole = await Query("Insert into master_roles (mr_name, mr_create_at) values (?,?)", [value.roleName, new Date()]);
  res
    .status(201)
    .json({ success: true, message: "Role created.", data: createRole});
});

// Update Roles
 router.put("/updateRole/:id",async function (req, res) {
   const id = parseInt(req.params.id, 10);

   const { error, value } = validateRoles(req.body, id);
   const updateRole = await Query("Update master_roles set mr_name = ?, mr_update_at = ? where mr_id = ?", [value.roleName, new Date(), id]) ;
   if (error) {
     return res.status(400).json({ success: false, message: error });
   }
   res.json({ success: true, message: "Role updated.", data: updateRole });
 });

// Delete Roles
router.delete("/deleteRole/:id", async function (req, res) {
  const id = parseInt(req.params.id, 10);

  if (id.length === 0) {
    return res
      .status(404)
      .json({ success: false, message: "Role not found." });
  }

  const deleteRole = await Query("Delete from master_roles where mr_id = ?", [id]);
 

  res.json({ success: true, message: "Role deleted.", data : deleteRole});
});

module.exports = router;