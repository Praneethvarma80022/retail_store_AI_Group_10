const Sale = require("../models/Sale");
const Store = require("../models/Store");

const { normalizeProduct, normalizeSale, roundCurrency } = require("../lib/analytics");
const { isMongoReady } = require("../lib/db");
const { createHttpError } = require("../lib/errors");
const { escapeRegex, normalizeText, validateSalePayload } = require("../lib/validators");
const { createId, readLocalStore, writeLocalStore } = require("./fileStore");

function sortSales(sales) {
  return [...sales].sort(
    (left, right) => new Date(right.date || 0) - new Date(left.date || 0)
  );
}

function matchSearch(sale, search) {
  if (!search) return true;

  const haystack = [sale.customerName, sale.productName, sale.mobile]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return haystack.includes(search);
}

async function listSales(options = {}) {
  if (!options.ownerId) {
    throw createHttpError(401, "Sign in is required.");
  }

  const ownerId = String(options.ownerId);
  const search = normalizeText(options.search).toLowerCase();

  if (isMongoReady()) {
    const query = search
      ? {
          ownerId,
          $or: [
            { customerName: { $regex: escapeRegex(search), $options: "i" } },
            { productName: { $regex: escapeRegex(search), $options: "i" } },
            { mobile: { $regex: escapeRegex(search), $options: "i" } }
          ]
        }
      : { ownerId };
    const sales = await Sale.find(query).sort({ date: -1, createdAt: -1 }).lean();

    return sales.map(normalizeSale);
  }

  const data = await readLocalStore();
  return sortSales(
    data.sales
      .filter((sale) => String(sale.ownerId || "") === ownerId)
      .map(normalizeSale)
  ).filter((sale) => matchSearch(sale, search));
}

async function createSale(payload, options = {}) {
  if (!options.ownerId) {
    throw createHttpError(401, "Sign in is required.");
  }

  const ownerId = String(options.ownerId);
  const saleDate = payload.date ? new Date(payload.date) : new Date();

  if (Number.isNaN(saleDate.getTime())) {
    throw createHttpError(400, "Sale date is invalid.");
  }

  if (isMongoReady()) {
    const product = payload.productId
      ? await Store.findOne({ _id: payload.productId, ownerId })
      : await Store.findOne({
          ownerId,
          normalizedName: normalizeText(payload.productName).toLowerCase()
        });

    if (!product) {
      throw createHttpError(404, "Product not found.");
    }

    if (product.quantity < payload.quantity) {
      throw createHttpError(400, `Only ${product.quantity} units are available.`);
    }

    const previousQuantity = product.quantity;
    const unitPrice = Number(product.price) || 0;
    product.quantity -= payload.quantity;
    product.totalPrice = roundCurrency(product.quantity * unitPrice);
    await product.save();

    try {
      const sale = await Sale.create({
        ownerId,
        ownerEmail: options.ownerEmail || "",
        customerName: payload.customerName,
        mobile: payload.mobile,
        productId: String(product._id),
        productName: product.name,
        quantity: payload.quantity,
        unitPrice,
        totalPrice: roundCurrency(payload.quantity * unitPrice),
        date: saleDate
      });

      return {
        sale: normalizeSale(sale.toObject()),
        product: normalizeProduct(product.toObject())
      };
    } catch (error) {
      product.quantity = previousQuantity;
      product.totalPrice = roundCurrency(previousQuantity * unitPrice);
      await product.save().catch(() => null);
      throw error;
    }
  }

  const data = await readLocalStore();
  const normalizedProductName = normalizeText(payload.productName).toLowerCase();
  const product = data.products.find((item) => {
    if (String(item.ownerId || "") !== ownerId) {
      return false;
    }

    if (payload.productId) {
      return String(item.id) === String(payload.productId);
    }

    return (
      normalizeText(item.normalizedName || item.name).toLowerCase() ===
      normalizedProductName
    );
  });

  if (!product) {
    throw createHttpError(404, "Product not found.");
  }

  if (Number(product.quantity) < payload.quantity) {
    throw createHttpError(400, `Only ${product.quantity} units are available.`);
  }

  const timestamp = saleDate.toISOString();
  const unitPrice = Number(product.price) || 0;
  product.quantity -= payload.quantity;
  product.totalPrice = roundCurrency(product.quantity * unitPrice);
  product.updatedAt = timestamp;

  const sale = {
    id: createId("sale"),
    ownerId,
    ownerEmail: options.ownerEmail || "",
    customerName: payload.customerName,
    mobile: payload.mobile,
    productId: String(product.id),
    productName: product.name,
    quantity: payload.quantity,
    unitPrice,
    totalPrice: roundCurrency(payload.quantity * unitPrice),
    date: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp
  };

  data.sales.unshift(sale);
  await writeLocalStore(data);

  return {
    sale: normalizeSale(sale),
    product: normalizeProduct(product)
  };
}

async function importSales(rows, options = {}) {
  const items = Array.isArray(rows) ? rows : [];
  const summary = {
    imported: 0,
    errors: []
  };

  for (let index = 0; index < items.length; index += 1) {
    try {
      await createSale(validateSalePayload(items[index]), options);
      summary.imported += 1;
    } catch (error) {
      summary.errors.push({
        row: index + 1,
        message: error.message || "Unable to import sale row."
      });
    }
  }

  return summary;
}

module.exports = {
  createSale,
  importSales,
  listSales
};
