const { Query } = require('../database/config/db') // adjust path to wherever Query lives

// ---- Permission levels ----
const LEVELS = { view: 1, write: 2, all: 3 };

const METHOD_LEVEL = {
  GET: "view",
  POST: "write",
  PUT: "write",
  PATCH: "write",
  DELETE: "all",
};

// "Loan Rates", "loan-rates", "loan_rates" -> "loanrates"
const normalize = (s) => String(s ?? "").toLowerCase().replace(/[\s\-_]+/g, "");

const isAjax = (req) =>
  req.xhr || req.headers.accept?.includes("application/json");

// Pages every logged-in user can open
const ALWAYS_ALLOWED = ["", "dashboard", "profile"];

const auth = async (req, res, next) => {
  const deny = () => {
    if (isAjax(req)) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }
    return res.redirect("/auth");
  };

  try {
    const userId = req.session?.userId;
    if (!userId) return deny();

    const users = await Query(
      "SELECT mu_id, mu_role, mu_username, mu_fullname FROM master_users WHERE mu_id = ? LIMIT 1",
      [userId]
    );
    const user = users[0];

    if (!user) {
      return req.session.destroy(() => {
        res.clearCookie("sid"); // must match the cookie name in session.js
        deny();
      });
    }

        // Permissions saved at login by routes/auth.js (re-normalized to be safe)
    const permissions = {};
    for (const [key, value] of Object.entries(req.session.permissions ?? {})) {
      permissions[normalize(key)] = value;
    }

    // can("members") or can("members", "write")
    const can = (route, need = "view") =>
      (LEVELS[permissions[normalize(route)]] ?? 0) >= LEVELS[need];

    req.context = { ...user, permissions, can };
    res.locals.user = user; // usable in every EJS template
    res.locals.can = can;   // <% if (can("members", "write")) { %> ... <% } %>
    next();
  } catch (err) {
    next(err);
  }
};

// Checks the role's permission for the route
// permission()                  -> route from the URL, level from the HTTP method
// permission("members", "all")  -> fixed route and level
const permission = (routeName = null, level = null) => (req, res, next) => {
  const route = normalize(
    routeName ?? req.originalUrl.split("?")[0].split("/")[1]
  );

  if (ALWAYS_ALLOWED.includes(route)) return next();

  const need = level ?? METHOD_LEVEL[req.method] ?? "all";

  if (req.context?.can(route, need)) return next();

  if (isAjax(req)) {
    return res
      .status(403)
      .json({ success: false, message: "You don't have permission to do that." });
  }
  return res.redirect("/dashboard"); // adjust to your landing page
};

module.exports = { auth, permission };