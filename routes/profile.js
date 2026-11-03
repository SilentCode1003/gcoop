var express = require("express");
var router = express.Router();
const { Query } = require("../database/config/db");

function validateProfile(body, { requirePassword = true } = {}) {
  const employeeId = (body.EmployeeId ?? "").trim();
  const fullName = (body.FullName ?? "").trim();
  const address = (body.Address ?? "").trim();
  const contact= (body.Contact ?? "").trim();
  const registeredBy= (body.RegisteredBy ?? "").trim();

  if (!employeeId) return { error: "Employee ID is required." };
if (!fullName) return { error: "Full name is required." };
if (!address) return { error: "Address is required." };
if (!contact) return { error: "Contact is required." };
if (!registeredBy) return { error: "Registered By is required." };

  return { value: { employeeId, fullName, address, contact, registeredBy } };
}

// Profile Page
router.get("/", function (req, res) {
  res.render("layout/main-layout", {
    body: "../pages/profile-page.ejs",
    title: "Profile",
    pageScript: "../scripts/profile-script.ejs",
  });
});

/// Load Profile
router.get("/loadProfile", async (req, res) => {
    try {

        const sql = `
            SELECT
                mm_id AS id,
                mm_employee_id AS employeeId,
                mm_fullname AS fullName,
                mm_address AS address,
                mm_contact_no AS contact,
                mm_register_by AS registeredBy
            FROM master_members
            WHERE mm_id = ?;
        `;

        const result = await Query(sql, [req.session.userId]);

        if (!result.length) {
            return res.status(404).json({
                message: "Profile not found."
            });
        }

        res.json(result[0]);

    } catch (err) {

        console.error(err);

        res.status(500).json({
            message: err.message
        });

    }
});

module.exports = router;