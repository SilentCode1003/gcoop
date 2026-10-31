var express = require("express");
var router = express.Router();
const { Query } = require("./../database/config/db.js");

function validateRoutes(body, ignoreId = null) {

  const name = (body.name ?? "").trim();

  if (!name) return { error: "Name is required." };

return { value: { name }};

}

// Route Page
router.get("/", function (req, res) {
    res.render("layout/main-layout", {
        body: "../pages/routes-page.ejs",
        title: "Routes",
        // pageStyle: "/stylesheets/routes.css",
        pageScript: "../scripts/routes-script.ejs",
    });
});

// Load Route
router.get("/loadRoute",async function(req,res){
    const data = await Query("SELECT mr_id as id, mr_name as name, mr_create_at as createdDate, mr_update_at as updatedDate from master_routes")
    console.log(data)
    res.json(data)
});

// Create Route
router.post("/createRoute",async function (req, res) {
  const { error, value } = validateRoutes(req.body);
  if (error) {
    return res.status(400).json({ success: false, message: error });
  }
 const createRoutes = await Query("Insert into master_routes (mr_name, mr_create_at) values (?,?)", [value.name, new Date]);
  res
    .status(201)
    .json({ success: true, message: "Route created.", data: createRoutes});
});

// Update Route
 router.put("/updateRoute/:id",async function (req, res) {
   const id = parseInt(req.params.id, 10);

   const { error, value } = validateRoutes(req.body, id);
   const updateRoutes = await Query("Update master_routes set mr_name = ?, mr_update_at = ? where mr_id = ?", [value.name, new Date(), id]) ;
   if (error) {
     return res.status(400).json({ success: false, message: error });
   }
   res.json({ success: true, message: "Route updated.", data: updateRoutes });
 });

 // Delete  Route
 router.delete("/deleteRoute/:id", async function (req, res) {
   const id = parseInt(req.params.id, 10);
 
   if (id.length === 0) {
     return res
       .status(404)
       .json({ success: false, message: "Route not found." });
   }
 
   const deleteRoutes = await Query("Delete from master_routes where mr_id = ?", [id]);
  
 
   res.json({ success: true, message: "Route deleted.", data : deleteRoutes});
 });

module.exports = router;