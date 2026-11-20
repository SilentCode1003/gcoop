const express = require("express");
const path = require("path");
const fs = require("fs");
const PDFDocument = require("pdfkit");

const { Query } = require("../database/config/db.js");

const router = express.Router();

const ALLOWED_TYPES = [
    "DEPOSIT",
    "WITHDRAWAL",
    "INTEREST_PAYOUT",
    "PENALTY",
    "ADJUSTMENT",
    "TRANSFER"
];

const COLORS = {
    red: "#A71920",
    darkRed: "#7F1118",
    darkerRed: "#4F0B10",
    gold: "#C6A15B",
    black: "#202020",
    text: "#292929",
    muted: "#707070",
    light: "#F5F5F5",
    border: "#E5E5E5",
    green: "#16834A",
    debit: "#C9363E",
    white: "#FFFFFF"
};

/* =========================================
   FILTER VALIDATION
========================================= */

function cleanFilters(query) {
    const filters = {
        q: String(query.q || "").trim().slice(0, 100),
        member: query.member ? Number(query.member) : null,
        type: String(query.type || "").toUpperCase(),
        from: String(query.from || ""),
        to: String(query.to || "")
    };

    if (
        filters.member !== null &&
        (!Number.isInteger(filters.member) || filters.member <= 0)
    ) {
        throw new Error("Invalid member filter.");
    }

    if (
        filters.type &&
        !ALLOWED_TYPES.includes(filters.type)
    ) {
        throw new Error("Invalid transaction type.");
    }

    function validDate(value) {
        if (!value) return true;

        if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
            return false;
        }

        const date = new Date(value + "T00:00:00");

        return (
            !Number.isNaN(date.getTime()) &&
            date.toISOString().slice(0, 10) === value
        );
    }

    if (!validDate(filters.from) || !validDate(filters.to)) {
        throw new Error("Invalid date filter.");
    }

    if (
        filters.from &&
        filters.to &&
        filters.from > filters.to
    ) {
        throw new Error("Start date cannot be after end date.");
    }

    return filters;
}

/* =========================================
   SQL FILTER BUILDER
========================================= */

function buildWhere(filters) {
    const conditions = [];
    const params = [];

    if (filters.member) {
        conditions.push("sl.sl_savings_id = ?");
        params.push(filters.member);
    }

    if (filters.type) {
        conditions.push("sl.sl_transaction_type = ?");
        params.push(filters.type);
    }

    if (filters.from) {
        conditions.push("sl.sl_create_date >= ?");
        params.push(filters.from + " 00:00:00");
    }

    if (filters.to) {
        conditions.push(
            "sl.sl_create_date < DATE_ADD(?, INTERVAL 1 DAY)"
        );
        params.push(filters.to);
    }

    if (filters.q) {
        const search = "%" + filters.q + "%";

        conditions.push(`
            (
                sl.sl_reference_no LIKE ?
                OR sl.sl_description LIKE ?
                OR mm.mm_fullname LIKE ?
                OR mm.mm_employee_id LIKE ?
            )
        `);

        params.push(search, search, search, search);
    }

    return {
        sql: conditions.length
            ? "WHERE " + conditions.join(" AND ")
            : "",
        params
    };
}

/* =========================================
   GET LEDGER DATA
========================================= */

async function getLedgerRows(filters) {
    const where = buildWhere(filters);

    const sql = `
        SELECT
            sl.sl_id AS id,
            sl.sl_savings_id AS memberId,

            mm.mm_employee_id AS employeeId,
            mm.mm_fullname AS memberName,

            sl.sl_transaction_type AS transactionType,
            sl.sl_amount AS amount,
            sl.sl_balance_after AS balanceAfter,

            sl.sl_reference_no AS referenceNo,
            sl.sl_description AS description,

            COALESCE(mu.mu_fullname, 'System') AS createdBy,

            sl.sl_create_date AS createdDate,

            (
                SELECT previous.sl_balance_after
                FROM savings_ledger previous

                WHERE previous.sl_savings_id = sl.sl_savings_id

                AND (
                    previous.sl_create_date < sl.sl_create_date
                    OR (
                        previous.sl_create_date = sl.sl_create_date
                        AND previous.sl_id < sl.sl_id
                    )
                )

                ORDER BY
                    previous.sl_create_date DESC,
                    previous.sl_id DESC

                LIMIT 1
            ) AS previousBalance

        FROM savings_ledger sl

        INNER JOIN master_members mm
            ON mm.mm_id = sl.sl_savings_id

        LEFT JOIN master_users mu
            ON mu.mu_id = sl.sl_create_by

        ${where.sql}

        ORDER BY
            sl.sl_create_date DESC,
            sl.sl_id DESC
    `;

    const rows = await Query(sql, where.params);

    return Array.isArray(rows) ? rows : [];
}

/* =========================================
   HELPERS
========================================= */

function getDirection(row) {
    const type = String(row.transactionType || "").toUpperCase();

    if (["DEPOSIT", "INTEREST_PAYOUT"].includes(type)) {
        return "credit";
    }

    if (["WITHDRAWAL", "PENALTY"].includes(type)) {
        return "debit";
    }

    if (row.previousBalance !== null && row.previousBalance !== undefined) {
        const difference =
            Number(row.balanceAfter || 0) -
            Number(row.previousBalance || 0);

        if (difference > 0) return "credit";
        if (difference < 0) return "debit";
    }

    if (Number(row.amount || 0) < 0) {
        return "debit";
    }

    return "neutral";
}

function formatMoney(value) {
    return "PHP " + Number(value || 0).toLocaleString("en-PH", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function formatDate(value) {
    if (!value) return "-";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return String(value);
    }

    return date.toLocaleString("en-PH", {
        year: "numeric",
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
    });
}

/* =========================================
   PAGE
========================================= */

router.get("/", (req, res) => {
    res.render("layout/main-layout", {
        title: "Savings Ledger",
        body: "../pages/savingsledger-page.ejs",
        pageStyle: "savings-ledger.css",
        pageScript: "../scripts/savingsledger-script.ejs",
        roleName: req.session?.roleName
    });
});

/* =========================================
   LOAD MEMBERS
========================================= */

router.get("/load-member", async (req, res) => {
    try {
        const sql = `
            SELECT
                mm_id AS id,
                mm_fullname AS name
            FROM master_members
            ORDER BY mm_fullname ASC
        `;

        const rows = await Query(sql, []);

        res.json(Array.isArray(rows) ? rows : []);

    } catch (error) {
        console.error("Load members error:", error);

        res.status(500).json({
            message: "Unable to load members."
        });
    }
});

/* =========================================
   LOAD LEDGER
========================================= */

router.get("/load-ledger", async (req, res) => {
    try {
        const filters = cleanFilters(req.query);
        const rows = await getLedgerRows(filters);

        res.json(rows);

    } catch (error) {
        console.error("Load ledger error:", error);

        res.status(400).json({
            message: error.message || "Unable to load transactions."
        });
    }
});

/* =========================================
   GENERATE PDF REPORT
   PDFKIT BACKEND GENERATION
========================================= */

router.get("/generate-report", async (req, res) => {
    try {
        const filters = cleanFilters(req.query);
        const rows = await getLedgerRows(filters);

        if (!rows.length) {
            return res.status(404).json({
                message: "No transactions found for the selected filters."
            });
        }

        const filename =
            `5L_Savings_Ledger_Report_${new Date()
                .toISOString()
                .slice(0, 10)}.pdf`;

        /* LOGO LOCATION */

        const logoPath = path.join(
            __dirname,
            "..",
            "public",
            "images",
            "logo.png"
        );

        /* PDF DOCUMENT */

        const doc = new PDFDocument({
            size: "A4",
            layout: "landscape",
            margins: {
                top: 35,
                bottom: 42,
                left: 35,
                right: 35
            },
            bufferPages: true,
            info: {
                Title: "5L Savings Ledger Report",
                Author: "5L Solutions Coop",
                Subject: "Savings Ledger Transaction Report"
            }
        });

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
            "Content-Disposition",
            `attachment; filename="${filename}"`
        );

        doc.on("error", error => {
            console.error("PDFKit error:", error);

            if (!res.destroyed) {
                res.destroy(error);
            }
        });

        doc.pipe(res);

        const pageWidth = doc.page.width;
        const pageHeight = doc.page.height;

        /* =====================================
           SUMMARY CALCULATIONS
        ===================================== */

        let credits = 0;
        let debits = 0;

        rows.forEach(row => {
            const amount = Math.abs(Number(row.amount || 0));
            const direction = getDirection(row);

            if (direction === "credit") credits += amount;
            if (direction === "debit") debits += amount;
        });

        const net = credits - debits;

        /* =====================================
           REPORT HEADER
        ===================================== */

        function drawHeader() {
            doc.save();

            doc.rect(0, 0, pageWidth, 100)
                .fill(COLORS.red);

            doc.rect(0, 100, pageWidth, 5)
                .fill(COLORS.gold);

            /* 5L LOGO */

            if (fs.existsSync(logoPath)) {
                try {
                    doc.image(logoPath, 35, 19, {
                        fit: [75, 62],
                        align: "center",
                        valign: "center"
                    });
                } catch (error) {
                    console.error("Logo embedding error:", error);

                    drawFallbackLogo();
                }
            } else {
                console.warn("5L logo not found:", logoPath);
                drawFallbackLogo();
            }

            function drawFallbackLogo() {
                doc.roundedRect(39, 22, 66, 55, 8)
                    .lineWidth(2)
                    .strokeColor(COLORS.white)
                    .stroke();

                doc.fillColor(COLORS.white)
                    .font("Helvetica-Bold")
                    .fontSize(22)
                    .text("5L", 39, 38, {
                        width: 66,
                        align: "center"
                    });
            }

            /* BRAND */

            doc.fillColor(COLORS.white)
                .font("Helvetica-Bold")
                .fontSize(18)
                .text("5L SOLUTIONS COOP", 125, 27);

            doc.font("Helvetica")
                .fontSize(11)
                .text("SAVINGS LEDGER TRANSACTION REPORT", 125, 52);

            doc.fillColor("#F5D9A0")
                .fontSize(8)
                .text("OFFICIAL FINANCIAL TRANSACTION RECORD", 125, 72);

            /* RIGHT HEADER */

            doc.fillColor(COLORS.white)
                .font("Helvetica-Bold")
                .fontSize(9)
                .text("OFFICIAL REPORT", pageWidth - 230, 31, {
                    width: 195,
                    align: "right"
                });

            doc.font("Helvetica")
                .fontSize(8)
                .text(
                    "Generated: " + new Date().toLocaleString("en-PH"),
                    pageWidth - 260,
                    51,
                    {
                        width: 225,
                        align: "right"
                    }
                );

            doc.restore();
        }

        /* =====================================
           REPORT FOOTER
        ===================================== */

        function drawFooters() {
            const range = doc.bufferedPageRange();

            for (
                let page = range.start;
                page < range.start + range.count;
                page++
            ) {
                doc.switchToPage(page);

                doc.save();

                doc.moveTo(35, pageHeight - 30)
                    .lineTo(pageWidth - 35, pageHeight - 30)
                    .lineWidth(1)
                    .strokeColor(COLORS.gold)
                    .stroke();

                doc.fillColor(COLORS.muted)
                    .font("Helvetica-Bold")
                    .fontSize(7)
                    .text(
                        "5L SOLUTIONS COOP",
                        35,
                        pageHeight - 21
                    );

                doc.font("Helvetica")
                    .text(
                        "CONFIDENTIAL FINANCIAL RECORD",
                        pageWidth / 2 - 90,
                        pageHeight - 21,
                        {
                            width: 180,
                            align: "center"
                        }
                    );

                doc.text(
                    `Page ${page + 1} of ${range.count}`,
                    pageWidth - 100,
                    pageHeight - 21,
                    {
                        width: 65,
                        align: "right"
                    }
                );

                doc.restore();
            }
        }

        /* =====================================
           START FIRST PAGE
        ===================================== */

        drawHeader();

        let y = 120;

        /* SUMMARY TITLE */

        doc.fillColor(COLORS.text)
            .font("Helvetica-Bold")
            .fontSize(10)
            .text("REPORT SUMMARY", 36, y);

        y += 20;

        /* SUMMARY CARDS */

        const cards = [
            {
                label: "TRANSACTIONS",
                value: String(rows.length),
                color: COLORS.red
            },
            {
                label: "TOTAL CREDITS",
                value: formatMoney(credits),
                color: COLORS.green
            },
            {
                label: "TOTAL DEBITS",
                value: formatMoney(debits),
                color: COLORS.debit
            },
            {
                label: "NET CHANGE",
                value:
                    (net >= 0 ? "+" : "-") +
                    formatMoney(Math.abs(net)),
                color: COLORS.gold
            }
        ];

        const cardGap = 12;
        const cardWidth = (pageWidth - 72 - cardGap * 3) / 4;
        const cardHeight = 44;

        cards.forEach((card, index) => {
            const x = 36 + index * (cardWidth + cardGap);

            doc.roundedRect(
                x,
                y,
                cardWidth,
                cardHeight,
                6
            ).fill("#F3F4F3");

            doc.rect(x, y, 5, cardHeight)
                .fill(card.color);

            doc.fillColor(COLORS.muted)
                .font("Helvetica-Bold")
                .fontSize(7)
                .text(card.label, x + 13, y + 9);

            doc.fillColor(card.color)
                .font("Helvetica-Bold")
                .fontSize(12)
                .text(card.value, x + 13, y + 23, {
                    width: cardWidth - 22,
                    ellipsis: true
                });
        });

        y += 59;

        /* =====================================
           FILTER SUMMARY
        ===================================== */

        const filterParts = [];

        if (filters.q) {
            filterParts.push("Search: " + filters.q);
        }

        if (filters.member) {
            const selected = rows.find(
                row => Number(row.memberId) === filters.member
            );

            filterParts.push(
                "Member: " + (selected?.memberName || filters.member)
            );
        }

        if (filters.type) {
            filterParts.push(
                "Type: " + filters.type.replace(/_/g, " ")
            );
        }

        if (filters.from) {
            filterParts.push("From: " + filters.from);
        }

        if (filters.to) {
            filterParts.push("To: " + filters.to);
        }

        const filterText = filterParts.length
            ? filterParts.join(" | ")
            : "All transactions";

        doc.roundedRect(
            36,
            y,
            pageWidth - 72,
            30,
            5
        ).fill("#F8EEEE");

        doc.fillColor(COLORS.red)
            .font("Helvetica-Bold")
            .fontSize(7)
            .text("APPLIED FILTERS", 47, y + 10);

        doc.fillColor(COLORS.text)
            .font("Helvetica")
            .fontSize(8)
            .text(filterText, 130, y + 10, {
                width: pageWidth - 180,
                ellipsis: true
            });

        y += 45;

        /* =====================================
           TRANSACTION TABLE
        ===================================== */

        const columns = [
            { title: "REFERENCE NO.", width: 91 },
            { title: "DATE", width: 105 },
            { title: "MEMBER", width: 105 },
            { title: "TYPE", width: 86 },
            { title: "AMOUNT", width: 90 },
            { title: "BALANCE AFTER", width: 96 },
            { title: "DESCRIPTION", width: 155 },
            { title: "CREATED BY", width: 88 }
        ];

        const tableWidth = columns.reduce(
            (sum, column) => sum + column.width,
            0
        );

        const tableX = (pageWidth - tableWidth) / 2;
        const rowHeight = 27;

        function drawTableHeader() {
            doc.rect(
                tableX,
                y,
                tableWidth,
                25
            ).fill(COLORS.darkerRed);

            let x = tableX;

            columns.forEach((column, index) => {
                doc.fillColor(COLORS.white)
                    .font("Helvetica-Bold")
                    .fontSize(6.5)
                    .text(
                        column.title,
                        x + 4,
                        y + 9,
                        {
                            width: column.width - 8,
                            align:
                                index === 4 || index === 5
                                    ? "right"
                                    : "left",
                            lineBreak: false
                        }
                    );

                x += column.width;
            });

            y += 25;
        }

        drawTableHeader();

        /* TABLE DATA */

        rows.forEach((row, index) => {
            if (y + rowHeight > pageHeight - 48) {
                doc.addPage({
                    size: "A4",
                    layout: "landscape",
                    margins: {
                        top: 35,
                        bottom: 42,
                        left: 35,
                        right: 35
                    }
                });

                drawHeader();
                y = 120;
                drawTableHeader();
            }

            if (index % 2 === 0) {
                doc.rect(
                    tableX,
                    y,
                    tableWidth,
                    rowHeight
                ).fill("#F7F7F7");
            }

            doc.save();

            doc.rect(
                tableX,
                y,
                tableWidth,
                rowHeight
            )
            .strokeColor(COLORS.border)
            .lineWidth(.4)
            .stroke();

            const direction = getDirection(row);

            const amountColor =
                direction === "credit"
                    ? COLORS.green
                    : direction === "debit"
                        ? COLORS.debit
                        : COLORS.text;

            const sign =
                direction === "credit"
                    ? "+"
                    : direction === "debit"
                        ? "-"
                        : "";

            const values = [
                row.referenceNo || "-",
                formatDate(row.createdDate),
                row.memberName || "-",
                String(row.transactionType || "-").replace(/_/g, " "),
                sign + formatMoney(Math.abs(Number(row.amount || 0))),
                formatMoney(row.balanceAfter),
                row.description || "-",
                row.createdBy || "System"
            ];

            let x = tableX;

            values.forEach((value, columnIndex) => {
                const column = columns[columnIndex];

                doc.fillColor(
                    columnIndex === 4 ? amountColor : COLORS.text
                )
                .font(
                    columnIndex === 4
                        ? "Helvetica-Bold"
                        : "Helvetica"
                )
                .fontSize(6.5)
                .text(
                    String(value).replace(/\s+/g, " "),
                    x + 4,
                    y + 9,
                    {
                        width: column.width - 8,
                        height: 10,
                        ellipsis: true,
                        lineBreak: false,
                        align:
                            columnIndex === 4 ||
                            columnIndex === 5
                                ? "right"
                                : "left"
                    }
                );

                x += column.width;
            });

            doc.restore();

            y += rowHeight;
        });

        /* =====================================
           FINISH PDF
        ===================================== */

        drawFooters();

        doc.end();

    } catch (error) {
        console.error("Generate PDF report error:", error);

        if (!res.headersSent) {
            res.status(400).json({
                message:
                    error.message ||
                    "Unable to generate PDF report."
            });
        } else if (!res.destroyed) {
            res.destroy(error);
        }
    }
});

module.exports = router;