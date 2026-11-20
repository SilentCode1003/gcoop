var express = require("express");
var router = express.Router();
const crypto = require("crypto");
const { Query } = require("../database/config/db");

function parseId(value) {
  const id = Number.parseInt(value, 10);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function validateMembers(body) {
  const employeeId = String(body.EmployeeId ?? "").trim();
  const fullName = String(body.FullName ?? "").trim();
  const address = String(body.Address ?? "").trim();
  const contact = String(body.Contact ?? "").trim();

  if (!employeeId) return { error: "Employee ID is required." };
  if (!fullName) return { error: "Full name is required." };
  if (!address) return { error: "Address is required." };
  if (!contact) return { error: "Contact number is required." };

  if (!/^09\d{9}$/.test(contact)) {
    return { error: "Contact number must be 11 digits and start with 09." };
  }

  return { value: { employeeId, fullName, address, contact } };
}

// ==========================
// PAGE
// ==========================

router.get("/", function (req, res) {
  res.render("layout/main-layout", {
    body: "../pages/members-page.ejs",
    title: "Members",
    pageStyle: "/stylesheets/dashboard.css",
    pageScript: "../scripts/members-script.ejs",
    roleName: req.session.roleName,
  });
});

// ==========================
// LOAD
// ==========================

router.get("/load-member", async function (req, res) {
  try {
    const data = await Query(
      `SELECT
          mm_id AS id,
          mm_employee_id AS employeeId,
          mm_fullname AS fullName,
          mm_address AS address,
          mm_contact_no AS contact,
          mm_register_date AS registeredDate,
          mm_register_by AS registeredBy
       FROM master_members
       ORDER BY mm_id ASC`
    );

    res.json(data);
  } catch (err) {
    console.error("Load Members:", err);

    res.status(500).json({
      success: false,
      message: "Unable to load members.",
    });
  }
});

// ==========================
// CREATE (also creates the savings account)
// ==========================

router.post("/create-member", async function (req, res) {
  let memberId = null;

  try {
    const { error, value } = validateMembers(req.body);

    if (error) {
      return res.status(400).json({ success: false, message: error });
    }

    const result = await Query(
      `INSERT INTO master_members (
          mm_employee_id,
          mm_fullname,
          mm_address,
          mm_contact_no,
          mm_register_date,
          mm_register_by
       )
       VALUES (?, ?, ?, ?, ?,
          (SELECT mu_fullname FROM master_users WHERE mu_id = ?))`,
      [
        value.employeeId,
        value.fullName,
        value.address,
        value.contact,
        new Date(),
        req.session.userId,
      ]
    );

    memberId = result.insertId;

    // Every new member gets a savings account with a zero balance
    await Query(
      `INSERT INTO member_savings (
          ms_id,
          ms_member_id,
          ms_current_balance,
          ms_update_at
       )
       VALUES (?, ?, 0, ?)`,
      [crypto.randomUUID(), memberId, new Date()]
    );

    res.status(201).json({
      success: true,
      message: "Member created.",
      data: { id: memberId },
    });
  } catch (err) {
    console.error("Create Member:", err);

    // Undo the member if the savings account couldn't be created
    if (memberId) {
      try {
        await Query(`DELETE FROM master_members WHERE mm_id = ?`, [memberId]);
      } catch (cleanupErr) {
        console.error("Create Member cleanup:", cleanupErr);
      }
    }

    res.status(500).json({
      success: false,
      message: "Unable to create member.",
    });
  }
});

// ==========================
// UPDATE
// ==========================

router.put("/update-member/:id", async function (req, res) {
  try {
    const id = parseId(req.params.id);

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Invalid Member ID.",
      });
    }

    const { error, value } = validateMembers(req.body);

    if (error) {
      return res.status(400).json({ success: false, message: error });
    }

    const existing = await Query(
      `SELECT mm_id FROM master_members WHERE mm_id = ?`,
      [id]
    );

    if (!existing.length) {
      return res.status(404).json({
        success: false,
        message: "Member not found.",
      });
    }

    await Query(
      `UPDATE master_members
       SET mm_employee_id = ?,
           mm_fullname = ?,
           mm_address = ?,
           mm_contact_no = ?
       WHERE mm_id = ?`,
      [value.employeeId, value.fullName, value.address, value.contact, id]
    );

    res.json({ success: true, message: "Member updated." });
  } catch (err) {
    console.error("Update Member:", err);

    res.status(500).json({
      success: false,
      message: "Unable to update member.",
    });
  }
});

// ==========================
// DELETE (and the empty savings account)
// ==========================

router.delete("/delete-member/:id", async function (req, res) {
  try {
    const id = parseId(req.params.id);

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Invalid Member ID.",
      });
    }

    const existing = await Query(
      `SELECT mm_id FROM master_members WHERE mm_id = ?`,
      [id]
    );

    if (!existing.length) {
      return res.status(404).json({
        success: false,
        message: "Member not found.",
      });
    }

    // A savings account with history or money in it must stay
    const ledger = await Query(
      `SELECT COUNT(*) AS total
       FROM savings_ledger
       WHERE sl_savings_id = ?`,
      [id]
    );

    if (Number(ledger[0].total) > 0) {
      return res.status(400).json({
        success: false,
        message:
          "Cannot delete: this member has savings ledger transactions.",
      });
    }

    const savings = await Query(
      `SELECT ms_id, ms_current_balance, ms_update_at
       FROM member_savings
       WHERE ms_member_id = ?`,
      [id]
    );

    if (savings.some((s) => Number(s.ms_current_balance) > 0)) {
      return res.status(400).json({
        success: false,
        message: "Cannot delete: this member still has a savings balance.",
      });
    }

    await Query(`DELETE FROM member_savings WHERE ms_member_id = ?`, [id]);

    try {
      await Query(`DELETE FROM master_members WHERE mm_id = ?`, [id]);
    } catch (deleteErr) {
      // Put the savings account back if the member can't be deleted
      for (const s of savings) {
        await Query(
          `INSERT INTO member_savings (
              ms_id, ms_member_id, ms_current_balance, ms_update_at
           ) VALUES (?, ?, ?, ?)`,
          [s.ms_id, id, s.ms_current_balance, s.ms_update_at]
        );
      }

      if (deleteErr.code === "ER_ROW_IS_REFERENCED_2") {
        return res.status(409).json({
          success: false,
          message: "Cannot delete: this member is used by other records.",
        });
      }

      throw deleteErr;
    }

    res.json({ success: true, message: "Member deleted." });
  } catch (err) {
    console.error("Delete Member:", err);

    res.status(500).json({
      success: false,
      message: "Unable to delete member.",
    });
  }
});

module.exports = router;