const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const http = require("http");
const https = require("https");
const connectDB = require("./config/db");
const seedServicesIfEmpty = require("./utils/seedServices");
const seedAdminIfEmpty = require("./utils/seedAdmin");

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

  if (process.env.RENDER_EXTERNAL_HOSTNAME) {
    return `https://${process.env.RENDER_EXTERNAL_HOSTNAME}/api/health`;
  }

  console.warn("No public URL found for self-ping");
  return null;
}

function pingUrl(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith("https://") ? https : http;
    const req = client.get(url, (res) => {
      const statusCode = res.statusCode || 0;
      res.resume();
      resolve(statusCode);
    });

    req.on("error", reject);
    req.setTimeout(15000, () => {
      req.destroy(new Error("Self-ping timeout"));
    });
  });
}

function startSelfPing() {
  if (!SELF_PING_ENABLED) {
    console.log("Self-ping disabled");
    return;
  }

  const targetUrl = getSelfPingUrl();
  if (!targetUrl) return;

  console.log(`Self-ping enabled -> ${targetUrl}`);

  setInterval(async () => {
    try {
      const statusCode = await pingUrl(targetUrl);
      console.log(`Self-ping success (${statusCode})`);
    } catch (error) {
      console.error("Self-ping failed:", error.message);
    }
  }, 10 * 60 * 1000);
}

async function startServer() {
  await connectDB();
  await seedServicesIfEmpty();
  await seedAdminIfEmpty();

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    startSelfPing();
  });
}

startServer();
