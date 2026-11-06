var express = require("express");
var router = express.Router();
const { Query } = require("./../database/config/db.js");

function validatePermission(body, ignoreId = null) {

  const roleId = (body.RoleId ?? "").trim();
  const routeId = (body.RouteId ?? "").trim();
  const permission = (body.Permission ?? "").trim();


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
router.get("/load-permission",async function(req,res){
    const data = await Query("SELECT p.mrp_id AS id, p.mrp_role_id AS roleValue, p.mrp_route_id AS routeValue, role.mr_name AS roleId, route.mr_name AS routeId, p.mrp_permission AS permission, p.mrp_create_at AS createdDate, p.mrp_update_at AS updatedDate FROM master_role_permission p INNER JOIN master_roles role ON role.mr_id = p.mrp_role_id INNER JOIN master_routes route ON route.mr_id = p.mrp_route_id ORDER BY p.mrp_id ASC");
    console.log(data)
    res.json(data)
});

// Load Roles in Modal
router.get("/insert-role", async function (req, res) {
    const roles = await Query("SELECT mr_id AS id, mr_name AS name FROM master_roles ORDER BY mr_name");
    console.log(roles)
    res.json(roles);
});

// Load Routes in Modal
router.get("/insert-route", async function (req, res) {
    const routes = await Query("SELECT mr_id AS id, mr_name AS name FROM master_routes ORDER BY mr_name");
    console.log(routes)
    res.json(routes);
});

// Create Permissions
router.post("/create-permission", async function (req, res) {
  try {
    const { error, value } = validatePermission(req.body);
    if (error) {
      return res.status(400).json({ success: false, message: error });
    }

    // Stop duplicates (same role + same route)
    const existing = await Query(
      "SELECT mrp_id FROM master_role_permission WHERE mrp_role_id = ? AND mrp_route_id = ?",
      [value.roleId, value.routeId]
    );
    if (existing.length > 0) {
      return res.status(409).json({
        success: false,
        message: "This role already has a permission for that route.",
      });
    }

    const createPermission = await Query(
      "INSERT INTO master_role_permission (mrp_role_id, mrp_route_id, mrp_permission, mrp_create_at) VALUES (?,?,?,?)",
      [value.roleId, value.routeId, value.permission, new Date()]
    );

    res.status(201).json({ success: true, message: "Permission created.", data: createPermission });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Failed to save permission." });
  }
});

// Update Permissions
router.put("/update-permission/:id", async function (req, res) {
  try {
    const id = parseInt(req.params.id, 10);

    const { error, value } = validatePermission(req.body);
    if (error) {
      return res.status(400).json({ success: false, message: error });
    }

    // Duplicate check, ignoring the row being edited
    const existing = await Query(
      "SELECT mrp_id FROM master_role_permission WHERE mrp_role_id = ? AND mrp_route_id = ? AND mrp_id <> ?",
      [value.roleId, value.routeId, id]
    );
    if (existing.length > 0) {
      return res.status(409).json({
        success: false,
        message: "This role already has a permission for that route.",
      });
    }

    const updatePermissions = await Query(
      "UPDATE master_role_permission SET mrp_role_id = ?, mrp_route_id = ?, mrp_permission = ?, mrp_update_at = ? WHERE mrp_id = ?",
      [value.roleId, value.routeId, value.permission, new Date(), id]
    );

    res.json({ success: true, message: "Permission updated.", data: updatePermissions });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Failed to update permission." });
  }
});

 // Delete  Permissions
 router.delete("/delete-permission/:id", async function (req, res) {
   const id = parseInt(req.params.id, 10);

   if (id.length === 0) {
     return res
       .status(404)
       .json({ success: false, message: "Permission not found." });
   }
 
   const deletePermissions = await Query("Delete from master_role_permission where mrp_id = ?", [id]);
  
 
   res.json({ success: true, message: "Permission deleted.", data : deletePermissions });
 });

module.exports = router;