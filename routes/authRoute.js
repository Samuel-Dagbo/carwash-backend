const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const adminAuth = require("../middleware/authMiddleware");

const router = express.Router();


router.post("/login", async (req, res) => {
  const { email, password, username } = req.body || {};
  
  // Check if it's admin login (username-based for admin)
  if (username) {
    const adminUsername = process.env.ADMIN_USERNAME;
    const adminPasswordHash = process.env.ADMIN_PASSWORD_HASH;
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (!adminUsername || (!adminPasswordHash && !adminPassword) || !process.env.JWT_SECRET) {
      return res.status(500).json({
        message: "Admin authentication is not configured on the server",
      });
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
      user: {
        username: adminUsername,
        name: "Admin",
        role: "admin",
      },
    });
  }

  // Customer login (email-based)
  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required" });
  }

  try {
    const customer = await User.findOne({ email: email.toLowerCase().trim() });
    if (!customer) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const validPassword = await bcrypt.compare(password, customer.passwordHash);
    if (!validPassword) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const token = jwt.sign(
      { id: customer._id, role: customer.role, email: customer.email, name: customer.name },
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

// Register admin (for creating first admin user)
router.post("/admin/register", async (req, res) => {
  try {
    const { name, email, contact, password } = req.body || {};

    if (!name || !email || !contact || !password) {
      return res.status(400).json({ message: "All fields are required" });
    }

    // Check if admin already exists
    const existingAdmin = await User.findOne({ role: "admin" });
    if (existingAdmin) {
      return res.status(409).json({ message: "Admin already exists. Please contact system administrator." });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const admin = await User.create({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      contact: contact.trim(),
      passwordHash,
      role: "admin",
    });

    const token = jwt.sign(
      { id: admin._id, role: "admin", email: admin.email, name: admin.name },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    return res.status(201).json({
      token,
      user: {
        id: admin._id,
        name: admin.name,
        email: admin.email,
        contact: admin.contact,
        role: admin.role,
      },
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to create admin account" });
  }
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

// UPDATE customer profile (name, contact)
router.put("/customer/profile", adminAuth.customerAuth, async (req, res) => {
  try {
    const { name, contact } = req.body || {};

    if (!name && !contact) {
      return res.status(400).json({ message: "Name or contact is required" });
    }

    const updates = {};
    if (name?.trim()) {
      updates.name = name.trim();
    }
    if (contact?.trim()) {
      // Check if contact is already used by another customer
      const existingContact = await User.findOne({ 
        contact: contact.trim(),
        _id: { $ne: req.customer.id }
      });
      if (existingContact) {
        return res.status(409).json({ message: "This contact number is already in use" });
      }
      updates.contact = contact.trim();
    }

    const customer = await User.findByIdAndUpdate(
      req.customer.id,
      updates,
      { new: true, runValidators: true }
    ).select("-passwordHash");

    if (!customer) {
      return res.status(404).json({ message: "Customer not found" });
    }

    return res.json({
      message: "Profile updated successfully",
      user: {
        id: customer._id,
        name: customer.name,
        email: customer.email,
        contact: customer.contact,
        role: customer.role,
      },
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to update profile" });
  }
});

// CHANGE customer password
router.put("/customer/password", adminAuth.customerAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body || {};

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: "Current password and new password are required" });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ message: "New password must be at least 6 characters" });
    }

    const customer = await User.findById(req.customer.id);
    if (!customer) {
      return res.status(404).json({ message: "Customer not found" });
    }

    const validPassword = await bcrypt.compare(currentPassword, customer.passwordHash);
    if (!validPassword) {
      return res.status(401).json({ message: "Current password is incorrect" });
    }

    customer.passwordHash = await bcrypt.hash(newPassword, 10);
    await customer.save();

    return res.json({ message: "Password changed successfully" });
  } catch (error) {
    return res.status(500).json({ message: "Failed to change password" });
  }
});

module.exports = router;
