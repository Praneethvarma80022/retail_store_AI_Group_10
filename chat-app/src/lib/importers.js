function normalizeHeader(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function pickValue(row, candidates) {
  const lookup = new Map(
    Object.entries(row || {}).map(([key, value]) => [normalizeHeader(key), value])
  );

  for (const candidate of candidates) {
    const match = lookup.get(normalizeHeader(candidate));

    if (typeof match !== "undefined") {
      return String(match || "").trim();
    }
  }

  return "";
}

export function mapInventoryImportRows(rows) {
  return rows.map((row) => ({
    name: pickValue(row, ["product", "product name", "name"]),
    category: pickValue(row, ["category"]),
    sku: pickValue(row, ["sku"]),
    reorderLevel: pickValue(row, ["reorder level", "reorderlevel"]),
    quantity: pickValue(row, ["quantity", "stock", "available stock"]),
    price: pickValue(row, ["price", "unit price", "unitprice"]),
  }));
}

export function mapSalesImportRows(rows) {
  return rows.map((row) => ({
    customerName: pickValue(row, ["customer", "customer name", "customername"]),
    mobile: pickValue(row, ["mobile", "phone", "mobile number", "mobilenumber"]),
    productId: pickValue(row, ["product id", "productid"]),
    productName: pickValue(row, ["product", "product name", "productname"]),
    quantity: pickValue(row, ["quantity", "units"]),
    date: pickValue(row, ["date", "sale date", "saledate"]),
  }));
}
