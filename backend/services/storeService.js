const Store = require("../models/Store");

const { normalizeProduct, roundCurrency } = require("../lib/analytics");
const { isMongoReady } = require("../lib/db");
const { createHttpError } = require("../lib/errors");
const { escapeRegex, normalizeText, validateProductPayload } = require("../lib/validators");
const { createId, readLocalStore, writeLocalStore } = require("./fileStore");

function sortProducts(products) {
  return [...products].sort(
    (left, right) => new Date(right.updatedAt || 0) - new Date(left.updatedAt || 0)
  );
}

function findProductByNormalizedName(collection, normalizedName) {
  return collection.find(
    (item) =>
      normalizeText(item.normalizedName || item.name).toLowerCase() ===
      normalizedName
  );
}

function getOwnerId(options = {}) {
  if (!options.ownerId) {
    throw createHttpError(401, "Sign in is required.");
  }

  return String(options.ownerId);
}

async function listProducts(options = {}) {
  const ownerId = getOwnerId(options);
  const search = normalizeText(options.search).toLowerCase();

  if (isMongoReady()) {
    const query = search
      ? {
          ownerId,
          name: {
            $regex: escapeRegex(search),
            $options: "i"
          }
        }
      : { ownerId };
    const products = await Store.find(query).sort({ updatedAt: -1 }).lean();

    return products.map(normalizeProduct);
  }

  const data = await readLocalStore();
  const products = sortProducts(
    data.products
      .filter((product) => String(product.ownerId || "") === ownerId)
      .map(normalizeProduct)
  );

  if (!search) {
    return products;
  }

  return products.filter((product) =>
    product.name.toLowerCase().includes(search)
  );
}

async function listAvailableProducts(options = {}) {
  const products = await listProducts(options);
  return products.filter((product) => product.quantity > 0);
}

async function getProductById(id, options = {}) {
  const ownerId = getOwnerId(options);

  if (isMongoReady()) {
    const product = await Store.findOne({ _id: id, ownerId }).lean();

    if (!product) {
      throw createHttpError(404, "Product not found.");
    }

    return normalizeProduct(product);
  }

  const data = await readLocalStore();
  const product = data.products.find(
    (item) => String(item.id) === String(id) && String(item.ownerId || "") === ownerId
  );

  if (!product) {
    throw createHttpError(404, "Product not found.");
  }

  return normalizeProduct(product);
}

async function createProduct(payload, options = {}) {
  const ownerId = getOwnerId(options);
  const normalizedName = payload.name.toLowerCase();

  if (isMongoReady()) {
    const existing = await Store.findOne({ ownerId, normalizedName });

    if (existing) {
      existing.name = payload.name;
      existing.quantity += payload.quantity;
      existing.price = payload.price;
      existing.category = payload.category;
      existing.sku = payload.sku;
      existing.reorderLevel = payload.reorderLevel;
      await existing.save();

      return {
        action: "restocked",
        product: normalizeProduct(existing.toObject())
      };
    }

    const product = await Store.create({
      ...payload,
      ownerId,
      ownerEmail: options.ownerEmail || "",
      normalizedName
    });

    return {
      action: "created",
      product: normalizeProduct(product.toObject())
    };
  }

  const data = await readLocalStore();
  const existing = findProductByNormalizedName(
    data.products.filter((product) => String(product.ownerId || "") === ownerId),
    normalizedName
  );

  if (existing) {
    existing.name = payload.name;
    existing.quantity = Number(existing.quantity || 0) + payload.quantity;
    existing.price = payload.price;
    existing.normalizedName = normalizedName;
    existing.category = payload.category;
    existing.sku = payload.sku;
    existing.reorderLevel = payload.reorderLevel;
    existing.totalPrice = roundCurrency(existing.quantity * existing.price);
    existing.updatedAt = new Date().toISOString();

    await writeLocalStore(data);

    return {
      action: "restocked",
      product: normalizeProduct(existing)
    };
  }

  const timestamp = new Date().toISOString();
  const product = {
    id: createId("product"),
    ownerId,
    ownerEmail: options.ownerEmail || "",
    name: payload.name,
    normalizedName,
    category: payload.category,
    sku: payload.sku,
    reorderLevel: payload.reorderLevel,
    quantity: payload.quantity,
    price: payload.price,
    totalPrice: roundCurrency(payload.quantity * payload.price),
    createdAt: timestamp,
    updatedAt: timestamp
  };

  data.products.unshift(product);
  await writeLocalStore(data);

  return {
    action: "created",
    product: normalizeProduct(product)
  };
}

async function updateProduct(id, payload, options = {}) {
  const ownerId = getOwnerId(options);
  const nextNormalizedName = payload.name.toLowerCase();

  if (isMongoReady()) {
    const product = await Store.findOne({ _id: id, ownerId });

    if (!product) {
      throw createHttpError(404, "Product not found.");
    }

    const duplicate = await Store.findOne({
      ownerId,
      normalizedName: nextNormalizedName,
      _id: { $ne: id }
    });

    if (duplicate) {
      throw createHttpError(409, "Another product already uses that name.");
    }

    product.name = payload.name;
    product.normalizedName = nextNormalizedName;
    product.category = payload.category;
    product.sku = payload.sku;
    product.reorderLevel = payload.reorderLevel;
    product.quantity = payload.quantity;
    product.price = payload.price;
    await product.save();

    return normalizeProduct(product.toObject());
  }

  const data = await readLocalStore();
  const product = data.products.find(
    (item) => String(item.id) === String(id) && String(item.ownerId || "") === ownerId
  );

  if (!product) {
    throw createHttpError(404, "Product not found.");
  }

  const duplicate = data.products.find(
    (item) =>
      String(item.id) !== String(id) &&
      String(item.ownerId || "") === ownerId &&
      normalizeText(item.normalizedName || item.name).toLowerCase() ===
        nextNormalizedName
  );

  if (duplicate) {
    throw createHttpError(409, "Another product already uses that name.");
  }

  product.name = payload.name;
  product.normalizedName = nextNormalizedName;
  product.category = payload.category;
  product.sku = payload.sku;
  product.reorderLevel = payload.reorderLevel;
  product.quantity = payload.quantity;
  product.price = payload.price;
  product.totalPrice = roundCurrency(payload.quantity * payload.price);
  product.updatedAt = new Date().toISOString();

  await writeLocalStore(data);

  return normalizeProduct(product);
}

async function deleteProduct(id, options = {}) {
  const ownerId = getOwnerId(options);

  if (isMongoReady()) {
    const product = await Store.findOneAndDelete({ _id: id, ownerId }).lean();

    if (!product) {
      throw createHttpError(404, "Product not found.");
    }

    return normalizeProduct(product);
  }

  const data = await readLocalStore();
  const index = data.products.findIndex(
    (item) => String(item.id) === String(id) && String(item.ownerId || "") === ownerId
  );

  if (index === -1) {
    throw createHttpError(404, "Product not found.");
  }

  const [product] = data.products.splice(index, 1);
  await writeLocalStore(data);

  return normalizeProduct(product);
}

async function importProducts(rows, options = {}) {
  const items = Array.isArray(rows) ? rows : [];
  const summary = {
    created: 0,
    restocked: 0,
    errors: []
  };

  for (let index = 0; index < items.length; index += 1) {
    try {
      const result = await createProduct(validateProductPayload(items[index]), options);

      if (result.action === "restocked") {
        summary.restocked += 1;
      } else {
        summary.created += 1;
      }
    } catch (error) {
      summary.errors.push({
        row: index + 1,
        message: error.message || "Unable to import product row."
      });
    }
  }

  return summary;
}

module.exports = {
  createProduct,
  deleteProduct,
  getProductById,
  importProducts,
  listAvailableProducts,
  listProducts,
  updateProduct
};
