const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");

const { createDefaultData } = require("../data/defaultData");

const DATA_DIRECTORY = path.join(__dirname, "..", "data");
const DATA_FILE = path.join(DATA_DIRECTORY, "retail-data.json");

async function ensureLocalStore() {
  try {
    await fs.access(DATA_FILE);
  } catch (error) {
    await fs.mkdir(DATA_DIRECTORY, { recursive: true });
    await fs.writeFile(
      DATA_FILE,
      JSON.stringify(createDefaultData(), null, 2),
      "utf8"
    );
  }
}

async function readLocalStore() {
  await ensureLocalStore();
  const raw = await fs.readFile(DATA_FILE, "utf8");
  const data = JSON.parse(raw);

  return {
    products: Array.isArray(data.products) ? data.products : [],
    sales: Array.isArray(data.sales) ? data.sales : []
  };
}

async function writeLocalStore(data) {
  await fs.mkdir(DATA_DIRECTORY, { recursive: true });
  await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2), "utf8");
}

function createId(prefix) {
  if (typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

module.exports = {
  createId,
  ensureLocalStore,
  readLocalStore,
  writeLocalStore
};
