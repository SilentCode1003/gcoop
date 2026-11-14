var express = require("express");
var router = express.Router();
const crypto = require("crypto");

const { Query } = require("../database/config/db.js");

/*
 * member_savings:  ms_id (UUID), ms_member_id (INT),
 *                  ms_current_balance, ms_update_at
 * savings_ledger:  sl_id (UUID), sl_savings_id (INT -> member_savings.ms_member_id),
 *                  sl_transaction_type, sl_amount, sl_balance_after,
 *                  sl_reference_no (UNIQUE), sl_description,
 *                  sl_create_by (INT -> master_users.mu_id), sl_create_date
 *
 * member_savings.ms_current_balance is the source of truth.
 */

const UUID_REGEX =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const allowedTypes = [
    "DEPOSIT",
    "WITHDRAWAL",
    "INTEREST_PAYOUT",
    "PENALTY",
    "ADJUSTMENT",
    "TRANSFER"
];

// ==========================
// HELPERS
// ==========================

const round2 = (n) => Math.round(Number(n) * 100) / 100;

function isValidUUID(value) {
    return UUID_REGEX.test(String(value || "").trim());
}

function validateLedger(body) {
    const savingsId = Number(body.savingsId);
    const type = String(body.transactionType || "").trim();
    const amount = Number(body.amount);
    const description = String(body.description || "").trim();

    if (!Number.isInteger(savingsId) || savingsId <= 0) {
        return { error: "Valid Savings ID is required." };
    }

    if (!allowedTypes.includes(type)) {
        return { error: "Invalid transaction type." };
    }

    if (!Number.isFinite(amount) || amount <= 0) {
        return { error: "Amount must be greater than zero." };
    }

    if (round2(amount) !== amount) {
        return { error: "Amount can only have up to 2 decimal places." };
    }

    if (description.length > 1000) {
        return { error: "Description cannot exceed 1,000 characters." };
    }

    return { value: { savingsId, type, amount, description } };
}

function getSignedAmount(type, amount) {
    switch (type) {
        case "DEPOSIT":
        case "INTEREST_PAYOUT":
        case "ADJUSTMENT":
        case "TRANSFER":
            return Number(amount);

        case "WITHDRAWAL":
        case "PENALTY":
            return -Number(amount);

        default:
            throw new Error("Invalid transaction type.");
    }
}

// Format: P + YYYYMM + - + 4 digits  (e.g. P202611-0001)
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

// ---- member balance (source of truth) ----

async function getMemberBalance(memberId) {
    const rows = await Query(
        `SELECT ms_current_balance
         FROM member_savings
         WHERE ms_member_id = ?`,
        [memberId]
    );

    return rows.length ? Number(rows[0].ms_current_balance) : null;
}

async function setMemberBalance(memberId, balance) {
    await Query(
        `UPDATE member_savings
         SET ms_current_balance = ?,
             ms_update_at = ?
         WHERE ms_member_id = ?`,
        [round2(balance), new Date(), memberId]
    );
}

// ---- ledger rows at/after a given row (same member) ----

function afterClause(includeSelf) {
    return `(sl_create_date > ?
             OR (sl_create_date = ?
                 AND sl_reference_no ${includeSelf ? ">=" : ">"} ?))`;
}

function afterParams(memberId, row) {
    return [
        memberId,
        row.sl_create_date,
        row.sl_create_date,
        row.sl_reference_no
    ];
}

// Lowest sl_balance_after among the affected rows (or null if none)
async function getAffectedMin(memberId, row, includeSelf) {
    const rows = await Query(
        `SELECT MIN(sl_balance_after) AS minBalance
         FROM savings_ledger
         WHERE sl_savings_id = ?
           AND ${afterClause(includeSelf)}`,
        afterParams(memberId, row)
    );

    return rows[0] && rows[0].minBalance !== null
        ? Number(rows[0].minBalance)
        : null;
}

// Shift sl_balance_after of the affected rows by delta
async function shiftAffected(memberId, row, delta, includeSelf) {
    if (delta === 0) return;

    await Query(
        `UPDATE savings_ledger
         SET sl_balance_after = sl_balance_after + ?
         WHERE sl_savings_id = ?
           AND ${afterClause(includeSelf)}`,
        [delta, ...afterParams(memberId, row)]
    );
}

// ==========================
// PAGE
// ==========================

router.get("/", function (req, res) {
    res.render("layout/main-layout", {
        body: "../pages/savingsledger-page.ejs",
        title: "Savings Ledger",
        pageScript: "../scripts/savingsledger-script.ejs",
        roleName: req.session.roleName
    });
});

// ==========================
// LOAD MEMBER SAVINGS (dropdown)
// ==========================

router.get("/load-member", async function (req, res) {
    try {
        const data = await Query(
            `SELECT
                ms_member_id AS id,
                ms_current_balance AS balance
             FROM member_savings
             ORDER BY ms_member_id ASC`
        );

        res.json(data);
    } catch (err) {
        console.error("Load Savings IDs:", err);

        res.status(500).json({
            success: false,
            message: "Unable to load savings IDs."
        });
    }
});

// ==========================
// LOAD LEDGER
// ==========================

router.get("/load-ledger", async function (req, res) {
    try {
        const data = await Query(
            `SELECT
                sl.sl_id               AS id,
                sl.sl_savings_id       AS savingsId,
                sl.sl_transaction_type AS transactionType,
                sl.sl_amount           AS amount,
                sl.sl_balance_after    AS balanceAfter,
                sl.sl_reference_no     AS referenceNo,
                sl.sl_description      AS description,
                sl.sl_create_by        AS createdById,
                mu.mu_fullname         AS createdBy,
                sl.sl_create_date      AS createdDate
             FROM savings_ledger sl
             LEFT JOIN master_users mu
                    ON mu.mu_id = sl.sl_create_by
             ORDER BY sl.sl_create_date DESC, sl.sl_reference_no DESC`
        );

        res.json(data);
    } catch (err) {
        console.error("Load Ledger:", err);

        res.status(500).json({
            success: false,
            message: "Unable to load savings ledger."
        });
    }
});

// ==========================
// CREATE
// ==========================

router.post("/create-ledger", async function (req, res) {
    try {
        const { error, value } = validateLedger(req.body);

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

        const user = await Query(
            `SELECT mu_id FROM master_users WHERE mu_id = ?`,
            [createdBy]
        );

        if (!user.length) {
            return res.status(400).json({
                success: false,
                message: "Invalid created-by user."
            });
        }

        const currentBalance = await getMemberBalance(value.savingsId);

        if (currentBalance === null) {
            return res.status(400).json({
                success: false,
                message: "Savings account not found."
            });
        }

        const balanceAfter = round2(
            currentBalance + getSignedAmount(value.type, value.amount)
        );

        if (balanceAfter < 0) {
            return res.status(400).json({
                success: false,
                message:
                    "Insufficient balance. Current balance is ₱" +
                    currentBalance.toFixed(2) + "."
            });
        }

        const ledgerId = crypto.randomUUID();
        const referenceNo = await generateReferenceNo();

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
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                ledgerId,
                value.savingsId,
                value.type,
                value.amount,
                balanceAfter,
                referenceNo,
                value.description || null,
                createdBy,
                new Date()
            ]
        );

        await setMemberBalance(value.savingsId, balanceAfter);

        res.status(201).json({
            success: true,
            message: "Savings transaction created successfully.",
            data: { id: ledgerId, referenceNo, balanceAfter }
        });
    } catch (err) {
        console.error("Create Ledger:", err);

        res.status(500).json({
            success: false,
            message: "Unable to create savings transaction."
        });
    }
});

// ==========================
// UPDATE
// ==========================

router.put("/update-ledger/:id", async function (req, res) {
    try {
        const id = String(req.params.id || "").trim();

        if (!isValidUUID(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid Ledger ID."
            });
        }

        const { error, value } = validateLedger(req.body);

        if (error) {
            return res.status(400).json({ success: false, message: error });
        }

        const existing = await Query(
            `SELECT sl_id, sl_savings_id, sl_transaction_type, sl_amount,
                    sl_reference_no, sl_create_date
             FROM savings_ledger
             WHERE sl_id = ?`,
            [id]
        );

        if (!existing.length) {
            return res.status(404).json({
                success: false,
                message: "Transaction not found."
            });
        }

        const row = existing[0];
        const memberId = Number(row.sl_savings_id);

        if (value.savingsId !== memberId) {
            return res.status(400).json({
                success: false,
                message:
                    "The member cannot be changed. Delete this transaction and create a new one instead."
            });
        }

        const oldSigned = getSignedAmount(
            row.sl_transaction_type,
            row.sl_amount
        );
        const newSigned = getSignedAmount(value.type, value.amount);
        const delta = round2(newSigned - oldSigned);

        const currentBalance = await getMemberBalance(memberId);

        if (currentBalance === null) {
            return res.status(400).json({
                success: false,
                message: "Savings account not found."
            });
        }

        const newMemberBalance = round2(currentBalance + delta);
        const minAffected = await getAffectedMin(memberId, row, true);

        if (
            newMemberBalance < 0 ||
            (minAffected !== null && round2(minAffected + delta) < 0)
        ) {
            return res.status(400).json({
                success: false,
                message: "This change would make the balance negative."
            });
        }

        await Query(
            `UPDATE savings_ledger
             SET
                sl_transaction_type = ?,
                sl_amount = ?,
                sl_description = ?
             WHERE sl_id = ?`,
            [value.type, value.amount, value.description || null, id]
        );

        // this row and every later row move by the same difference
        await shiftAffected(memberId, row, delta, true);
        await setMemberBalance(memberId, newMemberBalance);

        res.json({
            success: true,
            message: "Savings transaction updated successfully."
        });
    } catch (err) {
        console.error("Update Ledger:", err);

        res.status(500).json({
            success: false,
            message: "Unable to update savings transaction."
        });
    }
});

// ==========================
// DELETE
// ==========================

router.delete("/delete-ledger/:id", async function (req, res) {
    try {
        const id = String(req.params.id || "").trim();

        if (!isValidUUID(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid Ledger ID."
            });
        }

        const existing = await Query(
            `SELECT sl_id, sl_savings_id, sl_transaction_type, sl_amount,
                    sl_reference_no, sl_create_date
             FROM savings_ledger
             WHERE sl_id = ?`,
            [id]
        );

        if (!existing.length) {
            return res.status(404).json({
                success: false,
                message: "Transaction not found."
            });
        }

        const row = existing[0];
        const memberId = Number(row.sl_savings_id);

        const delta = round2(
            -getSignedAmount(row.sl_transaction_type, row.sl_amount)
        );

        const currentBalance = await getMemberBalance(memberId);

        if (currentBalance === null) {
            return res.status(400).json({
                success: false,
                message: "Savings account not found."
            });
        }

        const newMemberBalance = round2(currentBalance + delta);
        const minAffected = await getAffectedMin(memberId, row, false);

        if (
            newMemberBalance < 0 ||
            (minAffected !== null && round2(minAffected + delta) < 0)
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Cannot delete: it would make the balance negative."
            });
        }

        // shift later rows first (the row itself is excluded), then delete it
        await shiftAffected(memberId, row, delta, false);
        await Query(`DELETE FROM savings_ledger WHERE sl_id = ?`, [id]);
        await setMemberBalance(memberId, newMemberBalance);

        res.json({
            success: true,
            message: "Savings transaction deleted successfully."
        });
    } catch (err) {
        console.error("Delete Ledger:", err);

        res.status(500).json({
            success: false,
            message: "Unable to delete savings transaction."
        });
    }
});

module.exports = router;