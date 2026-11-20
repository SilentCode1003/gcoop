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

    // Read the permissions fresh from the database on every request,
    // so a permission change applies immediately (no re-login needed).
    // mu_role may hold the role id or the role name; both are matched.
    const rows = await Query(
      `SELECT rt.mr_name AS name, p.mrp_permission AS permission
       FROM master_role_permission p
       INNER JOIN master_roles ro ON ro.mr_id = p.mrp_role_id
       INNER JOIN master_routes rt ON rt.mr_id = p.mrp_route_id
       WHERE ro.mr_id = ? OR ro.mr_name = ?`,
      [user.mu_role, user.mu_role]
    );

    const permissions = {};
    for (const row of rows) {
      const key = normalize(row.name);
      const level = String(row.permission ?? "").toLowerCase();

      // keep the highest level if a route appears twice
      if ((LEVELS[level] ?? 0) > (LEVELS[permissions[key]] ?? 0)) {
        permissions[key] = level;
      }
    }

    // keep the session copy in sync for any code that still reads it
    req.session.permissions = permissions;

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