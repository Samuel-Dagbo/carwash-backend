const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const adminAuth = require("../middleware/authMiddleware");

const router = express.Router();

router.post("/login", async (req, res) => {
  const { username, password } = req.body || {};
  const adminUsername = process.env.ADMIN_USERNAME;
  const adminPasswordHash = process.env.ADMIN_PASSWORD_HASH;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminUsername || (!adminPasswordHash && !adminPassword) || !process.env.JWT_SECRET) {
    return res.status(500).json({
      message: "Admin authentication is not configured on the server",
    });
  }

  if (!username || !password) {
    return res.status(400).json({ message: "Username and password are required" });
  }

  if (username !== adminUsername) {
    return res.status(401).json({ message: "Invalid credentials" });
  }

  let passwordValid = false;

  if (adminPasswordHash) {
    passwordValid = await bcrypt.compare(password, adminPasswordHash);
  } else {
    passwordValid = password === adminPassword;
  }

  if (!passwordValid) {
    return res.status(401).json({ message: "Invalid credentials" });
  }

  const token = jwt.sign({ username: adminUsername, role: "admin" }, process.env.JWT_SECRET, {
    expiresIn: "8h",
  });

  return res.json({
    token,
    admin: {
      username: adminUsername,
      role: "admin",
    },
  });
});

router.post("/customer/register", async (req, res) => {
  try {
    const { name, email, contact, password } = req.body || {};

    if (!name || !email || !contact || !password) {
      return res.status(400).json({ message: "Name, email, contact and password are required" });
    }

    const existing = await User.findOne({ email: email.toLowerCase().trim() });
    if (existing) {
      return res.status(409).json({ message: "An account with this email already exists" });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const customer = await User.create({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      contact: contact.trim(),
      passwordHash,
      role: "customer",
    });

    const token = jwt.sign(
      { id: customer._id, role: "customer", email: customer.email, name: customer.name },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    return res.status(201).json({
      token,
      user: {
        id: customer._id,
        name: customer.name,
        email: customer.email,
        contact: customer.contact,
        role: customer.role,
      },
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to create customer account" });
  }
});

router.post("/customer/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    const customer = await User.findOne({ email: email.toLowerCase().trim() });
    if (!customer) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const validPassword = await bcrypt.compare(password, customer.passwordHash);
    if (!validPassword) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const token = jwt.sign(
      { id: customer._id, role: "customer", email: customer.email, name: customer.name },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    return res.json({
      token,
      user: {
        id: customer._id,
        name: customer.name,
        email: customer.email,
        contact: customer.contact,
        role: customer.role,
      },
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to log in" });
  }
});

router.get("/customer/me", adminAuth.customerAuth, async (req, res) => {
  try {
    const customer = await User.findById(req.customer.id).select("-passwordHash");
    if (!customer) {
      return res.status(404).json({ message: "Customer not found" });
    }
    return res.json(customer);
  } catch (error) {
    return res.status(500).json({ message: "Failed to load profile" });
  }
});

module.exports = router;
