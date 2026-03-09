const bcrypt = require("bcryptjs");
const User = require("../models/User");

const defaultAdmin = {
  name: "admin",
  email: "admin@carwash.com",
  contact: "1234567890",
  password: "admin123",
  role: "admin",
};

async function seedAdminIfEmpty() {
  try {
    const existingAdmin = await User.findOne({ role: "admin" });
    if (existingAdmin) {
      console.log("Admin user already exists, skipping seed");
      return;
    }

    const passwordHash = await bcrypt.hash(defaultAdmin.password, 10);
    await User.create({
      name: defaultAdmin.name,
      email: defaultAdmin.email,
      contact: defaultAdmin.contact,
      passwordHash,
      role: defaultAdmin.role,
    });

    console.log("Seeded default admin user");
    console.log("Admin login credentials:");
    console.log(`  Email: ${defaultAdmin.email}`);
    console.log(`  Password: ${defaultAdmin.password}`);
  } catch (error) {
    console.error("Failed to seed admin user:", error.message);
  }
}

module.exports = seedAdminIfEmpty;

