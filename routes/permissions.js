var express = require("express");
var router = express.Router();
const { Query } = require("./../database/config/db.js");

function validatePermission(body, ignoreId = null) {

  const roleId = (body.roleId ?? "").trim();
  const routeId = (body.routeId ?? "").trim();
  const permission = (body.permission ?? "").trim();


  if (!roleId) return { error: "Role is required." };
  if (!routeId) return { error: "Route is required." };
  if (!permission) return { error: "Permission is required." };

return { value: { roleId, routeId, permission }};

}

// Permission Page
router.get("/", function (req, res) {
    res.render("layout/main-layout", {
        body: "../pages/permissions-page.ejs",
        title: "Permissions",
        // pageStyle: "/stylesheets/routes.css",
        pageScript: "../scripts/permissions-script.ejs",
    });
});

// Load Permissions
router.get("/loadPermission",async function(req,res){
    const data = await Query("SELECT p.mrp_id as id, role.mr_name as roleId, route.mr_name as routeId, p.mrp_permission as permission, p.mrp_create_at as createdDate, p.mrp_update_at as updatedDate from master_role_permission p inner join master_roles role on role.mr_id = p.mrp_role_id inner join master_routes route on route.mr_id = p.mrp_route_id");
    console.log(data)
    res.json(data)
});

// Load Roles in Modal
router.get("/insertRole", async function (req, res) {
    const roles = await Query("SELECT mr_id AS id, mr_name AS name FROM master_roles ORDER BY mr_name");
    console.log(roles)
    res.json(roles);
});

// Load Routes in Modal
router.get("/insertRoute", async function (req, res) {
    const routes = await Query("SELECT mr_id AS id, mr_name AS name FROM master_routes ORDER BY mr_name");
    console.log(routes)
    res.json(routes);
});

// Create Permissions
router.post("/createPermission",async function (req, res) {
  const { error, value } = validatePermission(req.body);
  if (error) {
    return res.status(400).json({ success: false, message: error });
  }
 const createPermission = await Query("Insert into master_role_permissions (mrp_role_id, mrp_route_id, mrp_permission, mrp_create_at ) values (?,?,?)", [value.roleId, value.routeId, value,permission, new Date]);
  res
    .status(201)
    .json({ success: true, message: "Permission created.", data: createPermission});
});

// Update Permissions
 router.put("/updatePermission/:id",async function (req, res) {
   const id = parseInt(req.params.id, 10);

   const { error, value } = validatePermission(req.body, id);
   const updatePermissions = await Query("Update master_role_permissions set mrp_role_id = ?, mrp_route_id = ?, mrp_permission = ?, mrp_update_at = ? where mr_id = ?", [value.roleId, value.routeId, value.permission, new Date(), id]) ;
   if (error) {
     return res.status(400).json({ success: false, message: error });
   }
   res.json({ success: true, message: "Permission updated.", data: updatePermissions });
 });

 // Delete  Permissions
 router.delete("/deletePermission/:id", async function (req, res) {
   const id = parseInt(req.params.id, 10);
 
   if (id.length === 0) {
     return res
       .status(404)
       .json({ success: false, message: "Permission not found." });
   }
 
   const deletePermissions = await Query("Delete from master_role_permissions where mrp_id = ?", [id]);
  
 
   res.json({ success: true, message: "Route deleted.", data : deletePermissions });
 });

module.exports = router;