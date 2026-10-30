var express = require("express");
var router = express.Router();
const { Query } = require("./../database/config/db.js");

// Dashboard Page
router.get("/", function (req, res) {
    res.render("layout/main-layout", {
        body: "../pages/dashboard-page.ejs",
        title: "Dashboard",
        pageStyle: "../stylesheets/dashboard.css",
        pageScript: "../scripts/dashboard-script.ejs",
    });
});

// Load Dashboard Data
router.get("/load", async function (req, res) {
    try {

        // Total Members
        const totalMembers = await Query(`
            SELECT COUNT(*) AS total
            FROM master_members
        `);

        // Total Users
        const totalUsers = await Query(`
            SELECT COUNT(*) AS total
            FROM master_users
        `);

        // Total Loan Rates
        const totalLoanRates = await Query(`
            SELECT COUNT(*) AS total
            FROM master_loan_rates
        `);

        // Total Denominations
        const totalDenomination = await Query(`
            SELECT COUNT(*) AS total
            FROM master_denomination
        `);

        // Recent Members
        const members = await Query(`
            SELECT
                mm_employee_id AS employeeid,
                mm_fullname AS fullname,
                mm_contact_no AS contact,
                mm_register_date AS registerdate
            FROM master_members
            ORDER BY mm_register_date DESC
            LIMIT 5
        `);

        res.json({
            success: true,
            totalMembers: totalMembers[0].total,
            totalUsers: totalUsers[0].total,
            totalLoanRates: totalLoanRates[0].total,
            totalDenomination: totalDenomination[0].total,
            members: members
        });

    } catch (err) {
        console.log(err);

        res.status(500).json({
            success: false,
            message: "Failed to load dashboard data."
        });
    }
});

module.exports = router;