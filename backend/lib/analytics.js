const LOW_STOCK_THRESHOLD = 5;

const currencyFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0
});

const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium"
});

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundCurrency(value) {
  return Number(toNumber(value).toFixed(2));
}

function formatCurrency(value) {
  return currencyFormatter.format(toNumber(value));
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown date" : dateFormatter.format(date);
}

function inferCategory(product) {
  const explicitCategory = String(product.category || "").trim();

  if (explicitCategory) {
    return explicitCategory;
  }

  const name = String(product.name || "").toLowerCase();

  if (/(case|cover|protector)/.test(name)) return "Protection";
  if (/(charger|power bank|cable)/.test(name)) return "Power";
  if (/(earbuds|headset|speaker|audio)/.test(name)) return "Audio";
  if (/(mouse|keyboard|accessory)/.test(name)) return "Accessories";
  return "General";
}

function buildFallbackSku(name) {
  return String(name || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32) || "GENERAL-ITEM";
}

function getInventoryStatus(quantity, reorderLevel = LOW_STOCK_THRESHOLD) {
  const units = toNumber(quantity);
  const threshold = toNumber(reorderLevel) || LOW_STOCK_THRESHOLD;

  if (units <= 0) return "out-of-stock";
  if (units <= threshold) return "low-stock";
  return "healthy";
}

function normalizeProduct(product) {
  const quantity = toNumber(product.quantity);
  const price = roundCurrency(product.price);
  const reorderLevel = toNumber(product.reorderLevel || LOW_STOCK_THRESHOLD);
  const category = inferCategory(product);
  const sku = String(product.sku || buildFallbackSku(product.name));

  return {
    id: String(product.id || product._id || ""),
    _id: String(product._id || product.id || ""),
    ownerId: product.ownerId || "",
    ownerEmail: product.ownerEmail || "",
    name: product.name,
    category,
    sku,
    reorderLevel,
    quantity,
    price,
    totalPrice: roundCurrency(quantity * price),
    totalValue: roundCurrency(quantity * price),
    status: getInventoryStatus(quantity, reorderLevel),
    createdAt: product.createdAt || null,
    updatedAt: product.updatedAt || null
  };
}

function normalizeSale(sale) {
  const quantity = toNumber(sale.quantity);
  const unitPrice = roundCurrency(
    sale.unitPrice ?? (quantity ? toNumber(sale.totalPrice) / quantity : 0)
  );

  return {
    id: String(sale.id || sale._id || ""),
    _id: String(sale._id || sale.id || ""),
    ownerId: sale.ownerId || "",
    ownerEmail: sale.ownerEmail || "",
    customerName: sale.customerName || "Walk-in Customer",
    mobile: sale.mobile || "",
    productId: sale.productId || "",
    productName: sale.productName,
    quantity,
    unitPrice,
    totalPrice: roundCurrency(sale.totalPrice ?? quantity * unitPrice),
    date: sale.date || sale.createdAt || new Date().toISOString(),
    createdAt: sale.createdAt || sale.date || new Date().toISOString(),
    updatedAt: sale.updatedAt || sale.date || new Date().toISOString()
  };
}

function buildTopProducts(sales, limit = 5) {
  const salesMap = new Map();

  sales.forEach((sale) => {
    const current = salesMap.get(sale.productName) || {
      name: sale.productName,
      unitsSold: 0,
      revenue: 0
    };

    current.unitsSold += sale.quantity;
    current.revenue += sale.totalPrice;

    salesMap.set(sale.productName, current);
  });

  return Array.from(salesMap.values())
    .map((item) => ({
      ...item,
      revenue: roundCurrency(item.revenue)
    }))
    .sort((left, right) => right.unitsSold - left.unitsSold)
    .slice(0, limit);
}

function buildSalesTrend(sales, days = 7) {
  const buckets = [];
  const now = new Date();

  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const current = new Date(now);
    current.setHours(0, 0, 0, 0);
    current.setDate(current.getDate() - offset);

    buckets.push({
      key: current.toISOString().slice(0, 10),
      label: current.toLocaleDateString("en-IN", { weekday: "short" }),
      revenue: 0,
      orders: 0
    });
  }

  const bucketMap = new Map(buckets.map((bucket) => [bucket.key, bucket]));

  sales.forEach((sale) => {
    const date = new Date(sale.date);

    if (Number.isNaN(date.getTime())) return;

    const key = date.toISOString().slice(0, 10);
    const bucket = bucketMap.get(key);

    if (!bucket) return;

    bucket.revenue += sale.totalPrice;
    bucket.orders += 1;
  });

  return buckets.map((bucket) => ({
    ...bucket,
    revenue: roundCurrency(bucket.revenue)
  }));
}

function buildRecommendedActions(products, sales) {
  const actions = [];
  const lowStockItems = products.filter(
    (product) => product.status === "low-stock" || product.status === "out-of-stock"
  );
  const topProducts = buildTopProducts(sales, 3);

  if (lowStockItems.length) {
    actions.push(
      `Restock ${lowStockItems[0].name} first because only ${lowStockItems[0].quantity} units remain.`
    );
  }

  if (topProducts.length) {
    actions.push(
      `Bundle or promote ${topProducts[0].name} because it is leading sales volume.`
    );
  }

  const lastTrendPoint = buildSalesTrend(sales).at(-1);
  if (lastTrendPoint && lastTrendPoint.orders === 0) {
    actions.push("Sales are quiet today. Run a quick offer or WhatsApp campaign to drive traffic.");
  }

  if (!products.length) {
    actions.push("Start by adding your first products so inventory, sales, and AI insights can work properly.");
  }

  return actions.slice(0, 4);
}

function buildInsights(summary) {
  return [
    {
      title: "Revenue Pulse",
      tone: summary.totals.totalRevenue > 0 ? "positive" : "neutral",
      description: `The store has generated ${formatCurrency(summary.totals.totalRevenue)} so far.`
    },
    {
      title: "Inventory Resilience",
      tone: summary.totals.lowStockCount > 0 ? "attention" : "positive",
      description:
        summary.totals.lowStockCount > 0
          ? `${summary.totals.lowStockCount} items need restocking attention.`
          : "Stock levels are healthy across the catalog."
    },
    {
      title: "Order Quality",
      tone: summary.totals.averageOrderValue > 0 ? "neutral" : "attention",
      description: `Average order value is ${formatCurrency(summary.totals.averageOrderValue)}.`
    }
  ];
}

function buildAnalyticsSummary(products = [], sales = []) {
  const normalizedProducts = products
    .map(normalizeProduct)
    .sort((left, right) => right.totalValue - left.totalValue);
  const normalizedSales = sales
    .map(normalizeSale)
    .sort((left, right) => new Date(right.date) - new Date(left.date));

  const totalProducts = normalizedProducts.length;
  const totalUnits = normalizedProducts.reduce(
    (sum, product) => sum + product.quantity,
    0
  );
  const inventoryValue = normalizedProducts.reduce(
    (sum, product) => sum + product.totalValue,
    0
  );
  const totalRevenue = normalizedSales.reduce(
    (sum, sale) => sum + sale.totalPrice,
    0
  );
  const totalOrders = normalizedSales.length;
  const averageOrderValue = totalOrders ? totalRevenue / totalOrders : 0;
  const lowStockItems = normalizedProducts.filter(
    (product) => product.status === "low-stock" || product.status === "out-of-stock"
  );
  const outOfStockItems = normalizedProducts.filter(
    (product) => product.status === "out-of-stock"
  );

  const summary = {
    generatedAt: new Date().toISOString(),
    totals: {
      totalProducts,
      totalUnits,
      inventoryValue: roundCurrency(inventoryValue),
      totalRevenue: roundCurrency(totalRevenue),
      totalOrders,
      averageOrderValue: roundCurrency(averageOrderValue),
      lowStockCount: lowStockItems.length,
      outOfStockCount: outOfStockItems.length
    },
    inventoryHealth: {
      healthyCount: normalizedProducts.filter(
        (product) => product.status === "healthy"
      ).length,
      lowStockCount: lowStockItems.length,
      outOfStockCount: outOfStockItems.length
    },
    lowStockItems: lowStockItems.slice(0, 6),
    topProducts: buildTopProducts(normalizedSales),
    salesTrend: buildSalesTrend(normalizedSales),
    recentSales: normalizedSales.slice(0, 6),
    featuredInventory: normalizedProducts.slice(0, 6),
    recommendedActions: buildRecommendedActions(normalizedProducts, normalizedSales),
    assistantPrompts: [
      "Which items need restocking first?",
      "Show me the best-selling products.",
      "What is the current inventory value?",
      "Summarize recent sales performance."
    ]
  };

  summary.insights = buildInsights(summary);

  return summary;
}

module.exports = {
  LOW_STOCK_THRESHOLD,
  buildAnalyticsSummary,
  formatCurrency,
  formatDate,
  getInventoryStatus,
  inferCategory,
  normalizeProduct,
  normalizeSale,
  roundCurrency,
  toNumber
};
