const express = require("express");

const asyncHandler = require("../lib/asyncHandler");
const { buildRetailIntelligenceSummary } = require("../lib/retailIntelligence");
const { getStorageMode } = require("../lib/db");
const { listSales } = require("../services/salesService");
const { listProducts } = require("../services/storeService");

const router = express.Router();

async function getSummary(user) {
  const owner = {
    ownerId: user.sub,
    ownerEmail: user.email
  };
  const [products, sales] = await Promise.all([listProducts(owner), listSales(owner)]);
  return buildRetailIntelligenceSummary(products, sales);
}

router.get(
  "/overview",
  asyncHandler(async (req, res) => {
    res.json({
      ...(await getSummary(req.user)),
      storageMode: getStorageMode()
    });
  })
);

router.get(
  "/forecast",
  asyncHandler(async (req, res) => {
    const summary = await getSummary(req.user);

    res.json({
      ...summary.forecast,
      storageMode: getStorageMode()
    });
  })
);

router.get(
  "/recommendations",
  asyncHandler(async (req, res) => {
    const summary = await getSummary(req.user);

    res.json({
      ...summary.productRecommendations,
      storageMode: getStorageMode()
    });
  })
);

router.get(
  "/customers",
  asyncHandler(async (req, res) => {
    const summary = await getSummary(req.user);

    res.json({
      ...summary.customerInsights,
      storageMode: getStorageMode()
    });
  })
);

router.get(
  "/customer-service",
  asyncHandler(async (req, res) => {
    const summary = await getSummary(req.user);

    res.json({
      ...summary.customerService,
      storageMode: getStorageMode()
    });
  })
);

module.exports = router;
