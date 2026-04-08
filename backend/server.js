const cors = require("cors");
const path = require("path");
const express = require("express");

// Load environment variables from backend/.env
require("dotenv").config({ path: path.join(__dirname, ".env") });

const analyticsRoutes = require("./routes/analyticsRoutes");
const aiRoutes = require("./routes/assistantRoutes");
const authRoutes = require("./routes/authRoutes");
const customerServiceRoutes = require("./routes/customerServiceRoutes");
const demoRoutes = require("./routes/demoRoutes");
const healthRoutes = require("./routes/healthRoutes");
const salesRoutes = require("./routes/salesRoutes");
const storeRoutes = require("./routes/storeRoutes");
const { requireAuth } = require("./lib/auth");
const { connectToDatabase, getStorageMode } = require("./lib/db");
const { ensureLocalStore } = require("./services/fileStore");

const app = express();
const PORT = process.env.PORT || 5000;
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "http://localhost:5173";

// CORS configuration
app.use(
  cors({
    origin: [FRONTEND_ORIGIN, "http://localhost:3000", "http://localhost:5173", "http://localhost:5174", "http://localhost:5175"],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
  })
);

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false }));

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - start;
    const statusColor = res.statusCode >= 400 ? "⚠️ " : "✓ ";
    console.log(`${statusColor}[${res.statusCode}] ${req.method} ${req.path} (${duration}ms)`);
  });
  next();
});

app.get("/", (req, res) => {
  res.json({
    message: "Retail intelligence API is running.",
    storageMode: getStorageMode()
  });
});

app.use("/api/health", healthRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/demo", demoRoutes);
app.use("/api/store", requireAuth, storeRoutes);
app.use("/api/sales", requireAuth, salesRoutes);
app.use("/api/analytics", requireAuth, analyticsRoutes);
app.use("/api/ai", requireAuth, aiRoutes);
app.use("/api/customer-service", requireAuth, customerServiceRoutes);

app.use((req, res) => {
  console.warn(`[404] ${req.method} ${req.path} - Route not found`);
  res.status(404).json({
    error: "Route not found",
    status: 404,
    message: `${req.method} ${req.path} is not a valid endpoint`,
    availableEndpoints: {
      auth: [
        "POST /api/auth/register",
        "POST /api/auth/login",
        "POST /api/auth/google",
        "POST /api/auth/totp/setup",
        "POST /api/auth/totp/verify",
        "POST /api/auth/totp/verify-login",
        "POST /api/auth/totp/disable",
        "GET /api/auth/config",
        "GET /api/auth/me"
      ],
      health: "GET /api/health",
      protected: [
        "GET /api/store (requires auth)",
        "GET /api/sales (requires auth)",
        "GET /api/analytics (requires auth)",
        "GET /api/ai (requires auth)",
        "GET /api/customer-service (requires auth)"
      ]
    }
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
    console.log(`CORS enabled for origin: ${FRONTEND_ORIGIN}`);
  });
}

startServer().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
