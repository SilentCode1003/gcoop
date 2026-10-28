const express = require("express");
const router = express.Router();
const { Query } = require("../database/config/db.js");


function validateRole(body) {

    if (!body.Name || body.Name.trim() === "") {
        return {
            error: {
                details: [
                    {
                        message: "Role name is required."
                    }
                ]
            }
        };
    }

    return {
        error: null,
        value: body
    };

}

router.get("/", (req, res) => {
    res.render("layout/main-layout", {
        body: "../pages/roles-page.ejs",
        title: "Roles",
        pageScript: "../scripts/roles-script.ejs"
    });
});

/* ===========================
   Load Roles
=========================== */

router.get("/load", async (req, res) => {

    try {

        const sql = `
            SELECT
                mr_id AS id,
                mr_name AS name,
                mr_create_at AS createdDate,
                mr_update_at AS updatedDate
            FROM master_roles
            ORDER BY mr_name ASC
        `;

        const data = await Query(sql);

        res.json(data);

    } catch (err) {
        console.log(err);
        res.status(500).json({
            success: false,
            message: "Unable to load roles."
        });
    }

});

router.post("/create", async (req, res) => {

    const { error, value } = validateRole(req.body);

    if (error) {
        return res.status(400).json({
            success: false,
            message: error.details[0].message
        });
    }

    try {

        await Query(
            `
            INSERT INTO master_roles
            (
                mr_name,
                mr_create_at
            )
            VALUES
            (?,?)
            `,
            [
                value.Name,
                new Date()
            ]
        );

        res.json({
            success: true,
            message: "Role created successfully."
        });

    } catch (err) {

        console.log(err);

        res.status(500).json({
            success: false,
            message: "Unable to create role."
        });

    }

});

router.put("/update/:id", async (req, res) => {

    const id = parseInt(req.params.id);

    const { error, value } = validateRole(req.body);

    if (error) {
        return res.status(400).json({
            success: false,
            message: error.details[0].message
        });
    }

    try {

        const exist = await Query(
            "SELECT * FROM master_roles WHERE mr_id = ?",
            [id]
        );

        if (exist.length == 0) {

            return res.status(404).json({
                success: false,
                message: "Role not found."
            });

        }

        await Query(
            `
            UPDATE master_roles
            SET
                mr_name=?,
                mr_update_at=?
            WHERE mr_id=?
            `,
            [
                value.Name,
                new Date(),
                id
            ]
        );

        res.json({
            success: true,
            message: "Role updated successfully."
        });

    } catch (err) {

        console.log(err);

        res.status(500).json({
            success: false,
            message: "Unable to update role."
        });

    }

});

router.delete("/delete/:id", async (req, res) => {

    const id = parseInt(req.params.id);

    try {

        const exist = await Query(
            "SELECT * FROM master_roles WHERE mr_id=?",
            [id]
        );

        if (exist.length == 0) {

            return res.status(404).json({
                success: false,
                message: "Role not found."
            });

        }

        await Query(
            "DELETE FROM master_roles WHERE mr_id=?",
            [id]
        );

        res.json({
            success: true,
            message: "Role deleted successfully."
        });

    } catch (err) {

        console.log(err);

        res.status(500).json({
            success: false,
            message: "Unable to delete role."
        });

    }

});

module.exports = router;