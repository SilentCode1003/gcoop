var express = require("express");
var router = express.Router();
const { Query } = require("./../database/config/db.js");

function validateDenominations(body, ignoreId = null) {

  const name = (body.Name ?? "").trim();
  const value = (body.Value ?? "").trim();

  if (!name) return { error: "Name is required." };
  if (!value) return { error: "Value is required." };

return { value: { name, value }};

}

// Load Denomination Page
router.get("/", function (req, res, next) {
  res.render("layout/main-layout", {
    body: "../pages/denominations-page.ejs",
    title: "Denominations",
    pageScript: "../scripts/denominations-script.ejs",
  });
});

// Load Loan Rate
router.get("/loadDenomination",async function(req,res){
    const data = await Query("SELECT md_id as id, md_name as name, md_value as value , md_create_at as createdDate, md_update_at as updatedDate from master_denomination")
    console.log(data)
    res.json(data)
});

// Create Denomination
router.post("/createDenomination",async function (req, res) {
  const { error, value } = validateDenominations(req.body);
  if (error) {
    return res.status(400).json({ success: false, message: error });
  }
 const createDenominations = await Query("Insert into master_denomination (md_name, md_value, md_create_at) values (?,?,?)", [value.name, value.value, new Date]);
  res
    .status(201)
    .json({ success: true, message: "Denominations created.", data: createDenominations});
});

// Update Denomination
 router.put("/updateDenomination/:id",async function (req, res) {
   const id = parseInt(req.params.id, 10);

   const { error, value } = validateDenominations(req.body, id);
   const updateDenominations = await Query("Update master_denomination set md_name = ?, md_value = ?, md_update_at = ? where md_id = ?", [value.name, value.value, new Date(), id]) ;
   if (error) {
     return res.status(400).json({ success: false, message: error });
   }
   res.json({ success: true, message: "Denomination updated.", data: updateDenominations });
 });

// Delete  Denomination
 router.delete("/deleteDenomination/:id", async function (req, res) {
   const id = parseInt(req.params.id, 10);
 
   if (id.length === 0) {
     return res
       .status(404)
       .json({ success: false, message: "Denomination not found." });
   }
 
   const deleteDenominations = await Query("Delete from master_denomination where md_id = ?", [id]);
  
 
   res.json({ success: true, message: "Denomination deleted.", data : deleteDenominations });
 });

module.exports = router;