const jwt = require("jsonwebtoken");
const User = require("../models/User");

async function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const parts = header.split(" ");
    if (parts.length !== 2 || parts[0] !== "Bearer" || !parts[1]) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const payload = jwt.verify(parts[1], process.env.JWT_SECRET, {
      algorithms: ["HS256"]
    });

    const user = await User.findById(payload.sub);
    if (!user || user.status !== "active") {
      return res.status(401).json({ error: "Account unavailable" });
    }

    req.user = user;
    return next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

module.exports = authenticate;
