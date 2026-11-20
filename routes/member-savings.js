var express = require("express");
var router = express.Router();
const crypto = require("crypto");

const { Query } = require("../database/config/db.js");

/*
 * Member savings accounts are created automatically with the member
 * (see routes/members.js). Money moves through POST /transact, which
 * updates the balance and writes the ledger entry together.
 */

const allowedTypes = [
    "DEPOSIT",
    "WITHDRAWAL",
    "INTEREST_PAYOUT",
    "PENALTY",
    "ADJUSTMENT",
    "TRANSFER"
];

const round2 = (n) => Math.round(Number(n) * 100) / 100;

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

function validateTransaction(body) {
    const memberId = Number(body.memberId);
    const type = String(body.transactionType || "").trim();
    const amount = Number(body.amount);
    const description = String(body.description || "").trim();

    if (!Number.isInteger(memberId) || memberId <= 0) {
        return { error: "Valid member is required." };
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

    return { value: { memberId, type, amount, description } };
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

async function getBalance(memberId) {
    const rows = await Query(
        `SELECT ms_current_balance
         FROM member_savings
         WHERE ms_member_id = ?`,
        [memberId]
    );

    return rows.length ? Number(rows[0].ms_current_balance) : null;
}

// The reference number is the primary key, so retry if two users collide
async function insertLedger(entry) {
    for (let attempt = 0; attempt < 5; attempt++) {
        const referenceNo = await generateReferenceNo();

        try {
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
                    crypto.randomUUID(),
                    entry.memberId,
                    entry.type,
                    entry.amount,
                    entry.balanceAfter,
                    referenceNo,
                    entry.description || null,
                    entry.createdBy,
                    new Date()
                ]
            );

            return referenceNo;
        } catch (err) {
            if (err.code !== "ER_DUP_ENTRY") throw err;
        }
    }

    throw new Error("Unable to generate a unique reference number.");
}

// ==========================
// PAGE
// ==========================

router.get("/", function (req, res) {
    res.render("layout/main-layout", {
        body: "../pages/membersavings-page.ejs",
        title: "Member Savings",
        pageStyle: "savings-ledger.css",
        pageScript: "../scripts/membersavings-script.ejs",
        roleName: req.session.roleName
    });
});

// ==========================
// LOAD MEMBER SAVINGS
// (every member is listed, even one without an account yet)
// ==========================

router.get("/load-savings", async function (req, res) {
    try {
        const data = await Query(
            `SELECT
                mm.mm_id                          AS memberId,
                mm.mm_employee_id                 AS employeeId,
                mm.mm_fullname                    AS memberName,
                COALESCE(ms.ms_current_balance, 0) AS balance,
                ms.ms_update_at                   AS updatedAt,
                (
                    SELECT COUNT(*)
                    FROM savings_ledger sl
                    WHERE sl.sl_savings_id = mm.mm_id
                ) AS transactionCount
             FROM master_members mm
             LEFT JOIN member_savings ms
                    ON ms.ms_member_id = mm.mm_id
             ORDER BY mm.mm_fullname ASC`
        );

        res.json(
            data.map(function (row) {
                return {
                    ...row,
                    balance: Number(row.balance || 0),
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
// MEMBER TRANSACTION HISTORY
// (all ledger entries of one member, newest first)
// ==========================

router.get("/history/:memberId", async function (req, res) {
    try {
        const memberId = Number(req.params.memberId);

        if (!Number.isInteger(memberId) || memberId <= 0) {
            return res.status(400).json({
                success: false,
                message: "Valid member is required."
            });
        }

        const rows = await Query(
            `SELECT
                sl_id               AS id,
                sl_reference_no     AS referenceNo,
                sl_transaction_type AS type,
                sl_amount           AS amount,
                sl_balance_after    AS balanceAfter,
                sl_description      AS description,
                sl_create_date      AS createdAt
             FROM savings_ledger
             WHERE sl_savings_id = ?
             ORDER BY sl_create_date DESC, sl_reference_no DESC`,
            [memberId]
        );

        res.json(
            rows.map(function (row) {
                return {
                    ...row,
                    amount: Number(row.amount || 0),
                    balanceAfter: Number(row.balanceAfter || 0)
                };
            })
        );
    } catch (err) {
        console.error("Load Member History:", err);

        res.status(500).json({
            success: false,
            message: "Unable to load transaction history."
        });
    }
});

// ==========================
// TRANSACT (balance + ledger entry)
// ==========================

router.post("/transact", async function (req, res) {
    let applied = false;
    let memberId = null;
    let signed = 0;

    try {
        const { error, value } = validateTransaction(req.body);

        if (error) {
            return res.status(400).json({ success: false, message: error });
        }

        memberId = value.memberId;

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

        const member = await Query(
            `SELECT mm_id FROM master_members WHERE mm_id = ?`,
            [memberId]
        );

        if (!member.length) {
            return res.status(400).json({
                success: false,
                message: "Member not found."
            });
        }

        // Create the account on the first transaction if it doesn't exist yet
        if ((await getBalance(memberId)) === null) {
            await Query(
                `INSERT INTO member_savings (
                    ms_id, ms_member_id, ms_current_balance, ms_update_at
                 ) VALUES (?, ?, 0, ?)`,
                [crypto.randomUUID(), memberId, new Date()]
            );
        }

        signed = getSignedAmount(value.type, value.amount);

        // Atomic: the balance can never go below zero
        const update = await Query(
            `UPDATE member_savings
             SET ms_current_balance = ms_current_balance + ?,
                 ms_update_at = ?
             WHERE ms_member_id = ?
               AND ms_current_balance + ? >= 0`,
            [signed, new Date(), memberId, signed]
        );

        if (!update.affectedRows) {
            const balance = (await getBalance(memberId)) ?? 0;

            return res.status(400).json({
                success: false,
                message:
                    "Insufficient balance. Current balance is ₱" +
                    balance.toFixed(2) + "."
            });
        }

        applied = true;

        const balanceAfter = round2(await getBalance(memberId));

        const referenceNo = await insertLedger({
            memberId,
            type: value.type,
            amount: value.amount,
            balanceAfter,
            description: value.description,
            createdBy
        });

        res.status(201).json({
            success: true,
            message: "Transaction recorded.",
            data: { referenceNo, balanceAfter }
        });
    } catch (err) {
        console.error("Transact:", err);

        // Undo the balance change if the ledger entry couldn't be saved
        if (applied) {
            try {
                await Query(
                    `UPDATE member_savings
                     SET ms_current_balance = ms_current_balance - ?,
                         ms_update_at = ?
                     WHERE ms_member_id = ?`,
                    [signed, new Date(), memberId]
                );
            } catch (rollbackErr) {
                console.error("Transact rollback:", rollbackErr);
            }
        }

        res.status(500).json({
            success: false,
            message: "Unable to record the transaction."
        });
    }
});

module.exports = router;