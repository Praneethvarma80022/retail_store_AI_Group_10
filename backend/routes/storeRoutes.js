const express = require("express");
const asyncHandler = require("../lib/asyncHandler");
const { createHttpError } = require("../lib/errors");
const { validateProductPayload } = require("../lib/validators");
const {
  createProduct,
  deleteProduct,
  getProductById,
  importProducts,
  listAvailableProducts,
  listProducts,
  updateProduct
} = require("../services/storeService");

const router = express.Router();





const createProductHandler = asyncHandler(async (req, res) => {
  const payload = validateProductPayload(req.body);
  const result = await createProduct(payload, {
    ownerId: req.user.sub,
    ownerEmail: req.user.email
  });

  res.status(result.action === "created" ? 201 : 200).json(result);
});
// 🔥 Get only product names (for dropdown)
router.get(
  "/names",
  asyncHandler(async (req, res) => {
    const products = await listAvailableProducts({
      ownerId: req.user.sub,
      ownerEmail: req.user.email
    });
    res.json(products);
  })
);

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const products = await listProducts({
      ownerId: req.user.sub,
      ownerEmail: req.user.email,
      search: req.query.search
    });
    res.json(products);
  })
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const product = await getProductById(req.params.id, {
      ownerId: req.user.sub,
      ownerEmail: req.user.email
    });
    res.json(product);
  })
);

router.post("/", createProductHandler);
router.post("/add", createProductHandler);
router.post(
  "/import",
  asyncHandler(async (req, res) => {
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];

    if (!rows.length) {
      throw createHttpError(400, "Import rows are required.");
    }

    const summary = await importProducts(rows, {
      ownerId: req.user.sub,
      ownerEmail: req.user.email
    });

    res.json(summary);
  })
);

router.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const payload = validateProductPayload(req.body);
    const product = await updateProduct(req.params.id, payload, {
      ownerId: req.user.sub,
      ownerEmail: req.user.email
    });

    res.json({ product });
  })
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const product = await deleteProduct(req.params.id, {
      ownerId: req.user.sub,
      ownerEmail: req.user.email
    });
    res.json({ product });
  })
);

module.exports = router;
