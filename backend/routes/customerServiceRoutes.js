const express = require("express");

const asyncHandler = require("../lib/asyncHandler");
const { createHttpError } = require("../lib/errors");
const {
  createCustomerServiceContext,
  generateCustomerServiceReply
} = require("../lib/retailIntelligence");
const { normalizeText } = require("../lib/validators");
const { listSales } = require("../services/salesService");
const { listProducts } = require("../services/storeService");

const router = express.Router();

router.post(
  "/reply",
  asyncHandler(async (req, res) => {
    const type = normalizeText(req.body?.type).toLowerCase();
    const customerName = normalizeText(req.body?.customerName);
    const productId = normalizeText(req.body?.productId);
    const productName = normalizeText(req.body?.productName);

    if (!type) {
      throw createHttpError(400, "Reply type is required.");
    }

    if (!customerName) {
      throw createHttpError(400, "Customer name is required.");
    }

    const owner = {
      ownerId: req.user.sub,
      ownerEmail: req.user.email
    };
    const [products, sales] = await Promise.all([listProducts(owner), listSales(owner)]);
    const context = createCustomerServiceContext(products, sales);
    const reply = generateCustomerServiceReply(
      {
        type,
        customerName,
        productId,
        productName
      },
      context
    );

    res.json({
      reply,
      type,
      customerName
    });
  })
);

module.exports = router;
