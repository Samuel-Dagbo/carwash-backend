const jwt = require("jsonwebtoken");

function extractToken(req) {
  const authHeader = req.headers.authorization || "";
  return authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : null;
}

function verifyToken(req, res, next) {
  const token = extractToken(req);

  if (!token) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    req.auth = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}

function adminAuth(req, res, next) {
  return verifyToken(req, res, () => {
    if (req.auth.role !== "admin") {
      return res.status(403).json({ message: "Forbidden" });
    }
    req.admin = req.auth;
    return next();
  });
}

function customerAuth(req, res, next) {
  return verifyToken(req, res, () => {
    if (req.auth.role !== "customer") {
      return res.status(403).json({ message: "Forbidden" });
    }
    req.customer = req.auth;
    return next();
  });
}

function getTokenPayloadIfPresent(req) {
  const token = extractToken(req);
  if (!token) return null;
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    return null;
  }
}

adminAuth.customerAuth = customerAuth;
adminAuth.getTokenPayloadIfPresent = getTokenPayloadIfPresent;

module.exports = adminAuth;
