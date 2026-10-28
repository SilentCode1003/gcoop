const { Query } = require('../database/config/db') // adjust path to wherever Query lives

const auth = async (req, res, next) => {
  const deny = () => {
    if (req.xhr || req.headers.accept?.includes("application/json")) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }
    return res.redirect("/auth");
  };

  try {
    const userId = req.session?.userId;
    if (!userId) return deny();

    const users = await Query(
      "SELECT mu_id, mu_role, mu_username FROM master_users WHERE mu_id = ? LIMIT 1",
      [userId]
    );
    const user = users[0];

    if (!user) {
      return req.session.destroy(() => {
        res.clearCookie("sid"); // must match the cookie name in session.js
        deny();
      });
    }

    req.context = { ...user };
    res.locals.user = user; // usable in every EJS template
    next();
  } catch (err) {
    next(err);
  }
};

module.exports = {auth}