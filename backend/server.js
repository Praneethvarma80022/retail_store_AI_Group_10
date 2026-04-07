const cors = require("cors");
const express = require("express");
require("dotenv").config();

const analyticsRoutes = require("./routes/analyticsRoutes");
const aiRoutes = require("./routes/assistantRoutes");
const authRoutes = require("./routes/authRoutes");
const customerServiceRoutes = require("./routes/customerServiceRoutes");
const healthRoutes = require("./routes/healthRoutes");
const salesRoutes = require("./routes/salesRoutes");
const storeRoutes = require("./routes/storeRoutes");
const { requireAuth } = require("./lib/auth");
const { connectToDatabase, getStorageMode } = require("./lib/db");
const { ensureLocalStore } = require("./services/fileStore");

const app = express();
const PORT = process.env.PORT || 5000;
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN;

app.use(
  cors(
    FRONTEND_ORIGIN
      ? {
          origin: FRONTEND_ORIGIN,
          credentials: true
        }
      : undefined
  )
);
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false }));

app.get("/", (req, res) => {
  res.json({
    message: "Retail intelligence API is running.",
    storageMode: getStorageMode()
  });
});

app.use("/api/health", healthRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/store", requireAuth, storeRoutes);
app.use("/api/sales", requireAuth, salesRoutes);
app.use("/api/analytics", requireAuth, analyticsRoutes);
app.use("/api/ai", requireAuth, aiRoutes);
app.use("/api/customer-service", requireAuth, customerServiceRoutes);

app.use((req, res) => {
  res.status(404).json({
    error: "Route not found"
  });
});

app.use((error, req, res, next) => {
  const status = error.status || 500;

  if (status >= 500) {
    console.error("Unhandled API error:", error);
  }

  res.status(status).json({
    error: error.message || "Internal server error",
    details: error.details || null,
    storageMode: getStorageMode()
  });
});

async function startServer() {
  await ensureLocalStore();
  await connectToDatabase();

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
