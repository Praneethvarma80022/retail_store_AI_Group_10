const { createHttpError } = require("./errors");

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function escapeRegex(value) {
  return normalizeText(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseNumber(value, field, options = {}) {
  const { integer = false, min = 0 } = options;
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    throw createHttpError(400, `${field} must be a valid number.`);
  }

  if (integer && !Number.isInteger(parsed)) {
    throw createHttpError(400, `${field} must be a whole number.`);
  }

  if (parsed < min) {
    throw createHttpError(400, `${field} must be at least ${min}.`);
  }

  return parsed;
}

function parseText(value, field, maxLength = 80) {
  const normalized = normalizeText(value);

  if (!normalized) {
    throw createHttpError(400, `${field} is required.`);
  }

  if (normalized.length > maxLength) {
    throw createHttpError(
      400,
      `${field} must be ${maxLength} characters or fewer.`
    );
  }

  return normalized;
}

function parseOptionalText(value, maxLength = 80) {
  const normalized = normalizeText(value);

  if (!normalized) {
    return "";
  }

  if (normalized.length > maxLength) {
    throw createHttpError(
      400,
      `Value must be ${maxLength} characters or fewer.`
    );
  }

  return normalized;
}

function parseOptionalDate(value, field = "Date") {
  const normalized = normalizeText(value);

  if (!normalized) {
    return "";
  }

  const parsed = new Date(normalized);

  if (Number.isNaN(parsed.getTime())) {
    throw createHttpError(400, `${field} is invalid.`);
  }

  return parsed.toISOString();
}

function buildSkuFromName(name) {
  const normalized = normalizeText(name)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return normalized.slice(0, 32) || "GENERAL-ITEM";
}

function validateProductPayload(payload) {
  return {
    name: parseText(payload?.name, "Product name"),
    category: parseOptionalText(payload?.category, 40) || "General",
    sku: buildSkuFromName(payload?.sku || payload?.name),
    reorderLevel: parseNumber(payload?.reorderLevel ?? 5, "Reorder level", {
      integer: true,
      min: 0
    }),
    quantity: parseNumber(payload?.quantity, "Quantity", {
      integer: true,
      min: 0
    }),
    price: parseNumber(payload?.price, "Price", {
      min: 0
    })
  };
}

function validateSalePayload(payload) {
  const mobile = normalizeText(payload?.mobile);

  if (mobile && !/^[0-9+\-\s]{7,15}$/.test(mobile)) {
    throw createHttpError(400, "Mobile number format is invalid.");
  }

  const productId = normalizeText(payload?.productId);
  const productName = normalizeText(payload?.productName);

  if (!productId && !productName) {
    throw createHttpError(400, "Select a product before creating a sale.");
  }

  return {
    customerName: parseText(payload?.customerName, "Customer name"),
    mobile,
    productId,
    productName,
    quantity: parseNumber(payload?.quantity, "Quantity", {
      integer: true,
      min: 1
    }),
    date: parseOptionalDate(payload?.date, "Sale date")
  };
}

module.exports = {
  buildSkuFromName,
  escapeRegex,
  normalizeText,
  parseOptionalDate,
  parseOptionalText,
  validateProductPayload,
  validateSalePayload
};
