const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const fetch = require("node-fetch"); // IMPORTANT
const connectDB = require("./config/db");
const seedServicesIfEmpty = require("./utils/seedServices");

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

app.get("/api/health", (req, res) => {
  res.status(200).json({ status: "ok", uptime: process.uptime() });
});

app.use("/api/auth", require("./routes/authRoute"));
app.use("/api/services", require("./routes/serviceRoute"));
app.use("/api/bookings", require("./routes/bookingRoute"));

const PORT = process.env.PORT || 5000;
const SELF_PING_ENABLED =
  String(process.env.SELF_PING_ENABLED || "false").toLowerCase() === "true";

function getSelfPingUrl() {
  if (process.env.PUBLIC_BASE_URL) {
    return `${process.env.PUBLIC_BASE_URL.replace(/\/$/, "")}/api/health`;
  }

  if (process.env.RENDER_EXTERNAL_URL) {
    return `${process.env.RENDER_EXTERNAL_URL.replace(/\/$/, "")}/api/health`;
  }

  console.warn("⚠️ No public URL found for self-ping");
  return null;
}

function startSelfPing() {
  if (!SELF_PING_ENABLED) {
    console.log("Self-ping disabled");
    return;
  }

  const pingUrl = getSelfPingUrl();
  if (!pingUrl) return;

  console.log(`🔁 Self-ping enabled → ${pingUrl}`);

  setInterval(async () => {
    try {
      const res = await fetch(pingUrl);
      console.log(`✅ Self-ping success (${res.status})`);
    } catch (error) {
      console.error("❌ Self-ping failed:", error.message);
    }
  }, 10 * 60 * 1000);
}

async function startServer() {
  await connectDB();
  await seedServicesIfEmpty();

  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    startSelfPing();
  });
}

startServer();