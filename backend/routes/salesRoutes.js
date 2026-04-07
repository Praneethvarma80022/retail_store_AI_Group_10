const express = require("express");

const asyncHandler = require("../lib/asyncHandler");
const { validateSalePayload } = require("../lib/validators");
const { createSale, listSales } = require("../services/salesService");

const router = express.Router();

const createSaleHandler = asyncHandler(async (req, res) => {
  const payload = validateSalePayload(req.body);
  const result = await createSale(payload, {
    ownerId: req.user.sub,
    ownerEmail: req.user.email
  });

  res.status(201).json(result);
});

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const sales = await listSales({
      ownerId: req.user.sub,
      ownerEmail: req.user.email,
      search: req.query.search
    });
    res.json(sales);
  })
);

router.post("/", createSaleHandler);
router.post("/add", createSaleHandler);

module.exports = router;
