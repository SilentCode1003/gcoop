const express = require("express");
const router = express.Router();
const { Query } = require("../database/config/db.js");

/*
 * master_roles:            mr_id, mr_name, mr_create_at, mr_update_at
 * master_routes:           mr_id, mr_name, ...
 * master_role_permission:  mrp_id, mrp_role_id, mrp_route_id,
 *                          mrp_permission ('view' | 'write' | 'all'),
 *                          mrp_create_at, mrp_update_at
 *
 * One row per role + route.
 */

const allowedPermissions = ["view", "write", "all"];

const normalize = (s) =>
    String(s ?? "").toLowerCase().replace(/[\s\-_]+/g, "");

function parseId(value) {
    const id = Number.parseInt(value, 10);
    return Number.isInteger(id) && id > 0 ? id : null;
}

function validateRole(body) {
    const roleName = String(body.Name ?? "").trim();

    if (!roleName) {
        return { error: "Role name is required." };
    }

    if (roleName.length > 300) {
        return { error: "Role name cannot exceed 300 characters." };
    }

    return { value: { roleName } };
}

/*
 * True when the logged-in user belongs to this role.
 * req.context.mu_role is set by the auth middleware and may hold
 * either the role id or the role name.
 */
function isOwnRole(req, roleId, roleName) {
    const myRole = String(req.context?.mu_role ?? "").trim().toLowerCase();

    if (!myRole) return false;

    return (
        myRole === String(roleId) ||
        myRole === String(roleName ?? "").trim().toLowerCase()
    );
}

// ==========================
// PAGE
// ==========================

router.get("/", (req, res) => {
    res.render("layout/main-layout", {
        body: "../pages/roles-page.ejs",
        title: "Roles & Permissions",
        pageStyle: "roles.css",
        pageScript: "../scripts/roles-script.ejs",
        roleName: req.session.roleName
    });
});

// ==========================
// LOAD ROLES
// ==========================

router.get("/load-role", async function (req, res) {
    try {
        const roles = await Query(
            `SELECT
                mr_id AS id,
                mr_name AS name,
                mr_create_at AS createdDate,
                mr_update_at AS updatedDate
             FROM master_roles
             ORDER BY mr_id ASC`
        );

        res.json(roles);
    } catch (err) {
        console.error("Load Roles:", err);

        res.status(500).json({
            success: false,
            message: "Unable to load roles."
        });
    }
});

// ==========================
// LOAD ROUTES (modules)
// ==========================

router.get("/load-routes", async function (req, res) {
    try {
        const routes = await Query(
            `SELECT mr_id AS id, mr_name AS name
             FROM master_routes
             ORDER BY mr_name ASC`
        );

        res.json(routes);
    } catch (err) {
        console.error("Load Routes:", err);

        res.status(500).json({
            success: false,
            message: "Unable to load routes."
        });
    }
});

// ==========================
// LOAD PERMISSIONS OF ONE ROLE
// ==========================

router.get("/load-permission/:roleId", async function (req, res) {
    try {
        const roleId = parseId(req.params.roleId);

        if (!roleId) {
            return res.status(400).json({
                success: false,
                message: "Invalid Role ID."
            });
        }

        const rows = await Query(
            `SELECT
                mrp_route_id AS routeId,
                mrp_permission AS permission
             FROM master_role_permission
             WHERE mrp_role_id = ?`,
            [roleId]
        );

        res.json(rows);
    } catch (err) {
        console.error("Load Permissions:", err);

        res.status(500).json({
            success: false,
            message: "Unable to load permissions."
        });
    }
});

// ==========================
// SAVE PERMISSIONS OF ONE ROLE (bulk)
// ==========================

router.put("/save-permissions/:roleId", async function (req, res) {
    try {
        const roleId = parseId(req.params.roleId);

        if (!roleId) {
            return res.status(400).json({
                success: false,
                message: "Invalid Role ID."
            });
        }

        const role = await Query(
            `SELECT mr_id, mr_name FROM master_roles WHERE mr_id = ?`,
            [roleId]
        );

        if (!role.length) {
            return res.status(404).json({
                success: false,
                message: "Role not found."
            });
        }

        // Permissions arrive as a JSON string (or an array)
        let list = req.body.Permissions;

        if (typeof list === "string") {
            try {
                list = JSON.parse(list);
            } catch (parseErr) {
                list = null;
            }
        }

        if (!Array.isArray(list)) {
            return res.status(400).json({
                success: false,
                message: "Invalid permission data."
            });
        }

        // route id -> permission
        const wanted = new Map();

        for (const item of list) {
            const routeId = parseId(item?.routeId);
            const permission = String(item?.permission ?? "")
                .trim()
                .toLowerCase();

            if (!routeId || !allowedPermissions.includes(permission)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid permission data."
                });
            }

            wanted.set(routeId, permission);
        }

        // Every route must exist
        const routes = await Query(`SELECT mr_id, mr_name FROM master_routes`);
        const validRoutes = new Set(routes.map((r) => Number(r.mr_id)));

        for (const routeId of wanted.keys()) {
            if (!validRoutes.has(routeId)) {
                return res.status(400).json({
                    success: false,
                    message: "One of the selected routes does not exist."
                });
            }
        }

        // Lock-out guard: you can't remove your own role's write access
        // to the Roles page.
        if (isOwnRole(req, roleId, role[0].mr_name)) {
            const rolesRoute = routes.find(
                (r) => normalize(r.mr_name) === "roles"
            );

            if (rolesRoute) {
                const level = wanted.get(Number(rolesRoute.mr_id));

                if (level !== "write" && level !== "all") {
                    return res.status(400).json({
                        success: false,
                        message:
                            "You cannot remove your own write access to the Roles page."
                    });
                }
            }
        }

        const current = await Query(
            `SELECT mrp_id, mrp_route_id, mrp_permission
             FROM master_role_permission
             WHERE mrp_role_id = ?`,
            [roleId]
        );

        const now = new Date();
        const seen = new Set();
        let inserted = 0;
        let updated = 0;
        let removed = 0;

        for (const row of current) {
            const routeId = Number(row.mrp_route_id);
            const want = wanted.get(routeId);

            // no longer selected (or a duplicate row) -> delete
            if (want === undefined || seen.has(routeId)) {
                await Query(
                    `DELETE FROM master_role_permission WHERE mrp_id = ?`,
                    [row.mrp_id]
                );
                removed++;
                continue;
            }

            seen.add(routeId);

            if (row.mrp_permission !== want) {
                await Query(
                    `UPDATE master_role_permission
                     SET mrp_permission = ?, mrp_update_at = ?
                     WHERE mrp_id = ?`,
                    [want, now, row.mrp_id]
                );
                updated++;
            }
        }

        for (const [routeId, permission] of wanted) {
            if (seen.has(routeId)) continue;

            await Query(
                `INSERT INTO master_role_permission
                    (mrp_role_id, mrp_route_id, mrp_permission, mrp_create_at)
                 VALUES (?, ?, ?, ?)`,
                [roleId, routeId, permission, now]
            );
            inserted++;
        }

        res.json({
            success: true,
            message: "Permissions updated.",
            data: { inserted, updated, removed }
        });
    } catch (err) {
        console.error("Save Permissions:", err);

        res.status(500).json({
            success: false,
            message: "Unable to save permissions."
        });
    }
});

// ==========================
// CREATE ROLE
// ==========================

router.post("/create-role", async function (req, res) {
    try {
        const { error, value } = validateRole(req.body);

        if (error) {
            return res.status(400).json({ success: false, message: error });
        }

        const duplicate = await Query(
            `SELECT mr_id FROM master_roles WHERE mr_name = ?`,
            [value.roleName]
        );

        if (duplicate.length) {
            return res.status(409).json({
                success: false,
                message: "A role with this name already exists."
            });
        }

        const result = await Query(
            `INSERT INTO master_roles (mr_name, mr_create_at) VALUES (?, ?)`,
            [value.roleName, new Date()]
        );

        res.status(201).json({
            success: true,
            message: "Role created.",
            data: { id: result.insertId }
        });
    } catch (err) {
        console.error("Create Role:", err);

        res.status(500).json({
            success: false,
            message: "Unable to create role."
        });
    }
});

// ==========================
// UPDATE ROLE
// ==========================

router.put("/update-role/:id", async function (req, res) {
    try {
        const id = parseId(req.params.id);

        if (!id) {
            return res.status(400).json({
                success: false,
                message: "Invalid Role ID."
            });
        }

        const { error, value } = validateRole(req.body);

        if (error) {
            return res.status(400).json({ success: false, message: error });
        }

        const existing = await Query(
            `SELECT mr_id, mr_name FROM master_roles WHERE mr_id = ?`,
            [id]
        );

        if (!existing.length) {
            return res.status(404).json({
                success: false,
                message: "Role not found."
            });
        }

        const duplicate = await Query(
            `SELECT mr_id FROM master_roles
             WHERE mr_name = ? AND mr_id <> ?`,
            [value.roleName, id]
        );

        if (duplicate.length) {
            return res.status(409).json({
                success: false,
                message: "A role with this name already exists."
            });
        }

        await Query(
            `UPDATE master_roles
             SET mr_name = ?, mr_update_at = ?
             WHERE mr_id = ?`,
            [value.roleName, new Date(), id]
        );

        res.json({ success: true, message: "Role updated." });
    } catch (err) {
        console.error("Update Role:", err);

        res.status(500).json({
            success: false,
            message: "Unable to update role."
        });
    }
});

// ==========================
// DELETE ROLE (and its permissions)
// ==========================

router.delete("/delete-role/:id", async function (req, res) {
    try {
        const id = parseId(req.params.id);

        if (!id) {
            return res.status(400).json({
                success: false,
                message: "Invalid Role ID."
            });
        }

        const existing = await Query(
            `SELECT mr_id, mr_name FROM master_roles WHERE mr_id = ?`,
            [id]
        );

        if (!existing.length) {
            return res.status(404).json({
                success: false,
                message: "Role not found."
            });
        }

        // You can't delete the role you are logged in with
        if (isOwnRole(req, id, existing[0].mr_name)) {
            return res.status(400).json({
                success: false,
                message: "You cannot delete your own role."
            });
        }

        // Keep a copy so the permissions can be restored if the role can't be deleted
        const snapshot = await Query(
            `SELECT mrp_role_id, mrp_route_id, mrp_permission,
                    mrp_create_at, mrp_update_at
             FROM master_role_permission
             WHERE mrp_role_id = ?`,
            [id]
        );

        await Query(
            `DELETE FROM master_role_permission WHERE mrp_role_id = ?`,
            [id]
        );

        try {
            await Query(`DELETE FROM master_roles WHERE mr_id = ?`, [id]);
        } catch (deleteErr) {
            for (const row of snapshot) {
                await Query(
                    `INSERT INTO master_role_permission
                        (mrp_role_id, mrp_route_id, mrp_permission,
                         mrp_create_at, mrp_update_at)
                     VALUES (?, ?, ?, ?, ?)`,
                    [
                        row.mrp_role_id,
                        row.mrp_route_id,
                        row.mrp_permission,
                        row.mrp_create_at,
                        row.mrp_update_at
                    ]
                );
            }

            if (deleteErr.code === "ER_ROW_IS_REFERENCED_2") {
                return res.status(409).json({
                    success: false,
                    message: "This role is still assigned to users."
                });
            }

            throw deleteErr;
        }

        res.json({ success: true, message: "Role deleted." });
    } catch (err) {
        console.error("Delete Role:", err);

        res.status(500).json({
            success: false,
            message: "Unable to delete role."
        });
    }
});

module.exports = router;