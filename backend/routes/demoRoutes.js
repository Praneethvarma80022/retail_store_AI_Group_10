const express = require("express");
const path = require("path");
const fs = require("fs");

const router = express.Router();

// Load retail data
function getRetailData() {
  try {
    const dataPath = path.join(__dirname, "../data/retail-data.json");
    const data = JSON.parse(fs.readFileSync(dataPath, "utf-8"));
    return data;
  } catch (error) {
    console.error("Error loading retail data:", error.message);
    return null;
  }
}

// Get all demo data
router.get("/", (req, res) => {
  const data = getRetailData();
  if (!data) {
    return res.status(500).json({ error: "Unable to load demo data" });
  }
  res.json(data);
});

// Get products
router.get("/products", (req, res) => {
  const data = getRetailData();
  if (!data) {
    return res.status(500).json({ error: "Unable to load products" });
  }
  res.json({ products: data.products });
});

// Get sales
router.get("/sales", (req, res) => {
  const data = getRetailData();
  if (!data) {
    return res.status(500).json({ error: "Unable to load sales" });
  }
  res.json({ sales: data.sales });
});

// Get forecasts
router.get("/forecasts", (req, res) => {
  const data = getRetailData();
  if (!data) {
    return res.status(500).json({ error: "Unable to load forecasts" });
  }
  res.json({ forecasts: data.forecasts });
});

// Get recommendations
router.get("/recommendations", (req, res) => {
  const data = getRetailData();
  if (!data) {
    return res.status(500).json({ error: "Unable to load recommendations" });
  }
  res.json({ recommendations: data.recommendations });
});

// Get dashboard metrics
router.get("/metrics", (req, res) => {
  const data = getRetailData();
  if (!data) {
    return res.status(500).json({ error: "Unable to load metrics" });
  }
  res.json({ 
    dashboardMetrics: data.dashboardMetrics, 
    analyticsCharts: data.analyticsCharts,
    customerInsights: data.customerInsights
  });
});

// Get stores
router.get("/stores", (req, res) => {
  const data = getRetailData();
  if (!data) {
    return res.status(500).json({ error: "Unable to load stores" });
  }
  res.json({ stores: data.stores });
});

module.exports = router;
