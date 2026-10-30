var express = require("express");
var router = express.Router();
const { Query } = require("./../database/config/db.js");

function validateloanRates(body, ignoreId = null) {

  const name = (body.name ?? "").trim();
  const loanRate = (body.rate ?? "").trim();

  if (!name) return { error: "Name is required." };
  if (!loanRate) return { error: "Rate is required." };

return { value: { name, loanRate }};

}

// Loan Rate Page
router.get("/", function (req, res) {
    res.render("layout/main-layout", {
        body: "../pages/loanrates-page.ejs",
        title: "Loan Rates",
        // pageStyle: "/stylesheets/dashboard.css",
        pageScript: "../scripts/loanrates-script.ejs",
    });
});

// Load Loan Rate
router.get("/loadloanRate",async function(req,res){
    const data = await Query("SELECT mlr_id as id, mlr_name as name, mlr_loan_rate as rate, mlr_create_at as createdDate, mlr_update_at as updatedDate from master_loan_rates")
    console.log(data)
    res.json(data)
});

// Create Loan Rate
router.post("/createloanRate",async function (req, res) {
  const { error, value } = validateloanRates(req.body);
  if (error) {
    return res.status(400).json({ success: false, message: error });
  }
 const createloanRate = await Query("Insert into master_loan_rates (mlr_name, mlr_loan_rate, mlr_create_at) values (?,?,?)", [value.name, value.loanRate, new Date]);
  res
    .status(201)
    .json({ success: true, message: "Loan Rate created.", data: createloanRate});
});

// Update Loan Rate
 router.put("/updateloanRate/:id",async function (req, res) {
   const id = parseInt(req.params.id, 10);

   const { error, value } = validateloanRates(req.body, id);
   const updateloanRates = await Query("Update master_loan_rates set mlr_name = ?, mlr_loan_rate = ?, mlr_update_at = ? where mlr_id = ?", [value.name, value.rate, new Date(), id]) ;
   if (error) {
     return res.status(400).json({ success: false, message: error });
   }
   res.json({ success: true, message: "Permission updated.", data: updateloanRates });
 });

// Delete  Loan Rate
 router.delete("/deleteloanRate/:id", async function (req, res) {
   const id = parseInt(req.params.id, 10);
 
   if (id.length === 0) {
     return res
       .status(404)
       .json({ success: false, message: "Route not found." });
   }
 
   const deleteloanRate = await Query("Delete from master_loan_rates where mlr_id = ?", [id]);
  
 
   res.json({ success: true, message: "Loan Rate deleted.", data : deleteloanRate });
 });

module.exports = router;