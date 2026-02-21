const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
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

async function startServer() {
  await connectDB();
  await seedServicesIfEmpty();
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
