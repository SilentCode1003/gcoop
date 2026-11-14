var express = require("express");
var router = express.Router();
const crypto = require("crypto");

const { Query } = require("../database/config/db.js");

/*
 * !! CHANGE THESE 3 to match your members table !!
 * (If the name is split into first/last, use an expression such as
 *  "CONCAT(mm_firstname, ' ', mm_lastname)" for MEMBER_NAME.)
 */
const MEMBER_TABLE = "master_members";
const MEMBER_ID = "mm_id";
const MEMBER_NAME = "mm_fullname";

/*
 * member_savings: ms_id (UUID), ms_member_id (INT, one row per member),
 *                 ms_current_balance DECIMAL(15,2), ms_update_at DATETIME
 */

const UUID_REGEX =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ==========================
// HELPERS
// ==========================

const round2 = (n) => Math.round(Number(n) * 100) / 100;

function isValidUUID(value) {
    return UUID_REGEX.test(String(value || "").trim());
}

function validateSavings(body) {
    const memberId = Number(body.memberId);
    const balance = Number(body.balance === "" ? 0 : body.balance);

    if (!Number.isInteger(memberId) || memberId <= 0) {
        return { error: "Valid member is required." };
    }

    if (!Number.isFinite(balance) || balance < 0) {
        return { error: "Balance must be zero or greater." };
    }

    if (round2(balance) !== balance) {
        return { error: "Balance can only have up to 2 decimal places." };
    }

    return { value: { memberId, balance } };
}

// Same format as the Savings Ledger: P + YYYYMM + - + 4 digits
async function generateReferenceNo() {
    const now = new Date();
    const prefix =
        "P" +
        now.getFullYear() +
        String(now.getMonth() + 1).padStart(2, "0") +
        "-";

    const rows = await Query(
        `SELECT sl_reference_no
         FROM savings_ledger
         WHERE sl_reference_no LIKE ?
         ORDER BY sl_reference_no DESC
         LIMIT 1`,
        [prefix + "%"]
    );

    let next = 1;

    if (rows.length) {
        const last = parseInt(
            String(rows[0].sl_reference_no).split("-")[1],
            10
        );

        if (Number.isInteger(last)) {
            next = last + 1;
        }
    }

    return prefix + String(next).padStart(4, "0");
}

async function countTransactions(memberId) {
    const rows = await Query(
        `SELECT COUNT(*) AS total
         FROM savings_ledger
         WHERE sl_savings_id = ?`,
        [memberId]
    );

    return Number(rows[0].total || 0);
}

async function memberExists(memberId) {
    const rows = await Query(
        `SELECT ${MEMBER_ID} AS id
         FROM ${MEMBER_TABLE}
         WHERE ${MEMBER_ID} = ?`,
        [memberId]
    );

    return rows.length > 0;
}

// ==========================
// PAGE
// ==========================

router.get("/", function (req, res) {
    res.render("layout/main-layout", {
        body: "../pages/membersavings-page.ejs",
        title: "Member Savings",
        pageStyle: "member-savings.css",
        pageScript: "../scripts/membersavings-script.ejs",
        roleName: req.session.roleName
    });
});

// ==========================
// LOAD MEMBERS (dropdown)
// ==========================

router.get("/load-members", async function (req, res) {
    try {
        const data = await Query(
            `SELECT
                m.${MEMBER_ID} AS id,
                ${MEMBER_NAME} AS name,
                EXISTS (
                    SELECT 1
                    FROM member_savings ms
                    WHERE ms.ms_member_id = m.${MEMBER_ID}
                ) AS hasSavings
             FROM ${MEMBER_TABLE} m
             ORDER BY name ASC`
        );

        res.json(
            data.map(function (row) {
                return {
                    id: row.id,
                    name: row.name,
                    hasSavings: Number(row.hasSavings) === 1
                };
            })
        );
    } catch (err) {
        console.error("Load Members:", err);

        res.status(500).json({
            success: false,
            message: "Unable to load members."
        });
    }
});

// ==========================
// LOAD MEMBER SAVINGS
// ==========================

router.get("/load-savings", async function (req, res) {
    try {
        const data = await Query(
            `SELECT
                ms.ms_id                 AS id,
                ms.ms_member_id          AS memberId,
                ${MEMBER_NAME}           AS memberName,
                ms.ms_current_balance    AS balance,
                ms.ms_update_at          AS updatedAt,
                (
                    SELECT COUNT(*)
                    FROM savings_ledger sl
                    WHERE sl.sl_savings_id = ms.ms_member_id
                ) AS transactionCount
             FROM member_savings ms
             LEFT JOIN ${MEMBER_TABLE} m
                    ON m.${MEMBER_ID} = ms.ms_member_id
             ORDER BY ms.ms_update_at DESC, ms.ms_member_id ASC`
        );

        res.json(
            data.map(function (row) {
                return {
                    ...row,
                    transactionCount: Number(row.transactionCount || 0)
                };
            })
        );
    } catch (err) {
        console.error("Load Member Savings:", err);

        res.status(500).json({
            success: false,
            message: "Unable to load member savings."
        });
    }
});

// ==========================
// CREATE
// ==========================

router.post("/create-savings", async function (req, res) {
    let savingsId = null;

    try {
        const { error, value } = validateSavings(req.body);

        if (error) {
            return res.status(400).json({ success: false, message: error });
        }

        // Must match your actual session property.
        const createdBy = Number(req.session.userId);

        if (!Number.isInteger(createdBy) || createdBy <= 0) {
            return res.status(401).json({
                success: false,
                message: "User session is invalid. Please log in again."
            });
        }

        if (!(await memberExists(value.memberId))) {
            return res.status(400).json({
                success: false,
                message: "Member not found."
            });
        }

        const duplicate = await Query(
            `SELECT ms_id FROM member_savings WHERE ms_member_id = ?`,
            [value.memberId]
        );

        if (duplicate.length) {
            return res.status(400).json({
                success: false,
                message: "This member already has a savings account."
            });
        }

        savingsId = crypto.randomUUID();
        const now = new Date();

        await Query(
            `INSERT INTO member_savings (
                ms_id,
                ms_member_id,
                ms_current_balance,
                ms_update_at
            )
            VALUES (?, ?, ?, ?)`,
            [savingsId, value.memberId, value.balance, now]
        );

        // Record the opening balance in the ledger so both stay in sync
        if (value.balance > 0) {
            await Query(
                `INSERT INTO savings_ledger (
                    sl_id,
                    sl_savings_id,
                    sl_transaction_type,
                    sl_amount,
                    sl_balance_after,
                    sl_reference_no,
                    sl_description,
                    sl_create_by,
                    sl_create_date
                )
                VALUES (?, ?, 'DEPOSIT', ?, ?, ?, ?, ?, ?)`,
                [
                    crypto.randomUUID(),
                    value.memberId,
                    value.balance,
                    value.balance,
                    await generateReferenceNo(),
                    "Opening balance",
                    createdBy,
                    now
                ]
            );
        }

        res.status(201).json({
            success: true,
            message: "Member savings created successfully.",
            data: { id: savingsId }
        });
    } catch (err) {
        console.error("Create Member Savings:", err);

        // Undo the savings row if the ledger insert failed
        if (savingsId) {
            try {
                await Query(`DELETE FROM member_savings WHERE ms_id = ?`, [
                    savingsId
                ]);
            } catch (cleanupErr) {
                console.error("Create cleanup:", cleanupErr);
            }
        }

        res.status(500).json({
            success: false,
            message: "Unable to create member savings."
        });
    }
});

// ==========================
// UPDATE
// ==========================

router.put("/update-savings/:id", async function (req, res) {
    let ledgerMoved = false;
    let oldMemberId = null;
    let newMemberId = null;

    try {
        const id = String(req.params.id || "").trim();

        if (!isValidUUID(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid Savings ID."
            });
        }

        const { error, value } = validateSavings(req.body);

        if (error) {
            return res.status(400).json({ success: false, message: error });
        }

        const existing = await Query(
            `SELECT ms_id, ms_member_id, ms_current_balance
             FROM member_savings
             WHERE ms_id = ?`,
            [id]
        );

        if (!existing.length) {
            return res.status(404).json({
                success: false,
                message: "Member savings not found."
            });
        }

        oldMemberId = Number(existing[0].ms_member_id);
        newMemberId = value.memberId;

        const currentBalance = Number(existing[0].ms_current_balance);
        const hasTransactions = (await countTransactions(oldMemberId)) > 0;

        // With ledger history, the balance can only change in the Savings Ledger
        if (hasTransactions && round2(value.balance) !== round2(currentBalance)) {
            return res.status(400).json({
                success: false,
                message:
                    "This account has ledger transactions. Use the Savings Ledger to change the balance."
            });
        }

        if (!(await memberExists(newMemberId))) {
            return res.status(400).json({
                success: false,
                message: "Member not found."
            });
        }

        const duplicate = await Query(
            `SELECT ms_id
             FROM member_savings
             WHERE ms_member_id = ? AND ms_id <> ?`,
            [newMemberId, id]
        );

        if (duplicate.length) {
            return res.status(400).json({
                success: false,
                message: "This member already has a savings account."
            });
        }

        const memberChanged = newMemberId !== oldMemberId;

        if (memberChanged && hasTransactions) {
            // The new member must not have leftover ledger rows
            if ((await countTransactions(newMemberId)) > 0) {
                return res.status(400).json({
                    success: false,
                    message:
                        "The selected member already has ledger transactions."
                });
            }

            // Move the ledger history to the new member
            await Query(
                `UPDATE savings_ledger
                 SET sl_savings_id = ?
                 WHERE sl_savings_id = ?`,
                [newMemberId, oldMemberId]
            );

            ledgerMoved = true;
        }

        await Query(
            `UPDATE member_savings
             SET
                ms_member_id = ?,
                ms_current_balance = ?,
                ms_update_at = ?
             WHERE ms_id = ?`,
            [newMemberId, value.balance, new Date(), id]
        );

        res.json({
            success: true,
            message: "Member savings updated successfully."
        });
    } catch (err) {
        console.error("Update Member Savings:", err);

        // Put the ledger rows back if the savings update failed
        if (ledgerMoved) {
            try {
                await Query(
                    `UPDATE savings_ledger
                     SET sl_savings_id = ?
                     WHERE sl_savings_id = ?`,
                    [oldMemberId, newMemberId]
                );
            } catch (rollbackErr) {
                console.error("Update rollback:", rollbackErr);
            }
        }

        res.status(500).json({
            success: false,
            message: "Unable to update member savings."
        });
    }
});

// ==========================
// DELETE
// ==========================

router.delete("/delete-savings/:id", async function (req, res) {
    try {
        const id = String(req.params.id || "").trim();

        if (!isValidUUID(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid Savings ID."
            });
        }

        const existing = await Query(
            `SELECT ms_id, ms_member_id
             FROM member_savings
             WHERE ms_id = ?`,
            [id]
        );

        if (!existing.length) {
            return res.status(404).json({
                success: false,
                message: "Member savings not found."
            });
        }

        if ((await countTransactions(Number(existing[0].ms_member_id))) > 0) {
            return res.status(400).json({
                success: false,
                message:
                    "Cannot delete: this account has ledger transactions."
            });
        }

        await Query(`DELETE FROM member_savings WHERE ms_id = ?`, [id]);

        res.json({
            success: true,
            message: "Member savings deleted successfully."
        });
    } catch (err) {
        console.error("Delete Member Savings:", err);

        res.status(500).json({
            success: false,
            message: "Unable to delete member savings."
        });
    }
});

module.exports = router;