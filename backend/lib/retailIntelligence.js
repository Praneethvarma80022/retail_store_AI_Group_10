const {
  buildAnalyticsSummary,
  formatCurrency,
  formatDate,
  normalizeProduct,
  normalizeSale,
  roundCurrency,
  toNumber
} = require("./analytics");
const { normalizeText } = require("./validators");

const HISTORY_DAYS = 14;
const FORECAST_DAYS = 7;
const NOISE_PRODUCT_PATTERN = /\b(codex|verify product|test accessory|debug product|sample item)\b/i;

function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values) {
  if (values.length <= 1) return 0;
  const mean = average(values);
  const variance = average(values.map((value) => (value - mean) ** 2));
  return Math.sqrt(variance);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function buildDailyBuckets(sales, days = HISTORY_DAYS, startDate = new Date()) {
  const buckets = [];
  const anchor = new Date(startDate);

  anchor.setHours(0, 0, 0, 0);

  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const current = new Date(anchor);
    current.setDate(current.getDate() - offset);

    buckets.push({
      key: current.toISOString().slice(0, 10),
      date: current.toISOString(),
      label: current.toLocaleDateString("en-IN", { weekday: "short" }),
      revenue: 0,
      orders: 0,
      units: 0
    });
  }

  const bucketMap = new Map(buckets.map((bucket) => [bucket.key, bucket]));

  sales.forEach((sale) => {
    const date = new Date(sale.date);

    if (Number.isNaN(date.getTime())) {
      return;
    }

    const key = date.toISOString().slice(0, 10);
    const bucket = bucketMap.get(key);

    if (!bucket) {
      return;
    }

    bucket.revenue += toNumber(sale.totalPrice);
    bucket.orders += 1;
    bucket.units += toNumber(sale.quantity);
  });

  return buckets.map((bucket) => ({
    ...bucket,
    revenue: roundCurrency(bucket.revenue)
  }));
}

function buildForecast(normalizedSales) {
  const history = buildDailyBuckets(normalizedSales, HISTORY_DAYS);
  const recentWindow = history.slice(-FORECAST_DAYS);
  const previousWindow = history.slice(-FORECAST_DAYS * 2, -FORECAST_DAYS);

  const recentRevenueAverage = average(recentWindow.map((day) => day.revenue));
  const recentOrderAverage = average(recentWindow.map((day) => day.orders));
  const previousRevenueAverage = average(previousWindow.map((day) => day.revenue));
  const previousOrderAverage = average(previousWindow.map((day) => day.orders));
  const revenueTrend = recentRevenueAverage - previousRevenueAverage;
  const orderTrend = recentOrderAverage - previousOrderAverage;
  const revenueVolatility = standardDeviation(recentWindow.map((day) => day.revenue));

  const confidenceScore = clamp(
    100 -
      (recentRevenueAverage ? (revenueVolatility / recentRevenueAverage) * 35 : 40) +
      recentWindow.filter((day) => day.orders > 0).length * 4,
    42,
    92
  );

  const forecastDays = Array.from({ length: FORECAST_DAYS }, (_, index) => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() + index + 1);

    const weekendFactor = [0, 6].includes(date.getDay()) ? 1.08 : 1;
    const projectedRevenue = Math.max(
      recentRevenueAverage + revenueTrend * 0.35 + revenueTrend * 0.08 * index,
      0
    );
    const projectedOrders = Math.max(
      recentOrderAverage + orderTrend * 0.35 + orderTrend * 0.08 * index,
      0
    );

    return {
      date: date.toISOString(),
      label: date.toLocaleDateString("en-IN", { weekday: "short" }),
      projectedRevenue: roundCurrency(projectedRevenue * weekendFactor),
      projectedOrders: Math.max(Math.round(projectedOrders * weekendFactor), 0)
    };
  });

  const expectedRevenue = roundCurrency(
    forecastDays.reduce((sum, day) => sum + day.projectedRevenue, 0)
  );
  const expectedOrders = forecastDays.reduce(
    (sum, day) => sum + day.projectedOrders,
    0
  );

  return {
    history,
    next7Days: forecastDays,
    summary: {
      expectedRevenue,
      expectedOrders,
      dailyAverageRevenue: roundCurrency(recentRevenueAverage),
      trendDirection:
        revenueTrend > 150 ? "upward" : revenueTrend < -150 ? "softening" : "steady",
      confidenceScore: Math.round(confidenceScore),
      confidenceLabel:
        confidenceScore >= 78 ? "High confidence" : confidenceScore >= 62 ? "Moderate confidence" : "Emerging signal",
      method: "Weighted moving average with recent trend adjustment"
    }
  };
}

function buildProductStats(products, sales) {
  const statsMap = new Map(
    products.map((product) => [
      product.id,
      {
        unitsSold: 0,
        revenue: 0,
        orderCount: 0
      }
    ])
  );

  const nameToId = new Map(products.map((product) => [normalizeText(product.name).toLowerCase(), product.id]));

  sales.forEach((sale) => {
    const productId =
      sale.productId ||
      nameToId.get(normalizeText(sale.productName).toLowerCase());

    if (!productId || !statsMap.has(productId)) {
      return;
    }

    const current = statsMap.get(productId);
    current.unitsSold += toNumber(sale.quantity);
    current.revenue += toNumber(sale.totalPrice);
    current.orderCount += 1;
  });

  return statsMap;
}

function findBundleIdeas(products) {
  const lookup = new Map(
    products.map((product) => [normalizeText(product.name).toLowerCase(), product])
  );
  const ideas = [];

  const caseProduct = lookup.get("phone case");
  const protectorProduct = lookup.get("screen protector");
  const powerBank = lookup.get("power bank");
  const cable = lookup.get("usb-c cable");

  if (caseProduct && protectorProduct) {
    ideas.push({
      title: "Phone protection bundle",
      description: `Pair ${caseProduct.name} with ${protectorProduct.name} to raise basket size for shoppers buying phone accessories.`,
      products: [caseProduct.name, protectorProduct.name]
    });
  }

  if (powerBank && cable) {
    ideas.push({
      title: "Travel power combo",
      description: `Offer ${powerBank.name} with ${cable.name} as a quick convenience bundle for commuters and students.`,
      products: [powerBank.name, cable.name]
    });
  }

  return ideas;
}

function buildRecommendationBoard(normalizedProducts, normalizedSales) {
  const statsMap = buildProductStats(normalizedProducts, normalizedSales);

  const rankedProducts = normalizedProducts.map((product) => {
    const stats = statsMap.get(product.id) || {
      unitsSold: 0,
      revenue: 0,
      orderCount: 0
    };
    const stockDepth = toNumber(product.quantity);
    const sellThrough = stats.unitsSold
      ? stats.unitsSold / Math.max(stats.unitsSold + stockDepth, 1)
      : 0;

    return {
      ...product,
      unitsSold: stats.unitsSold,
      revenue: roundCurrency(stats.revenue),
      orderCount: stats.orderCount,
      sellThrough: Number(sellThrough.toFixed(2))
    };
  });

  const featured = rankedProducts
    .filter((product) => product.status === "healthy" && product.unitsSold > 0)
    .sort((left, right) => right.unitsSold - left.unitsSold || right.quantity - left.quantity)
    .slice(0, 4)
    .map((product) => ({
      name: product.name,
      category: product.category,
      action: "Promote now",
      reason: `${product.unitsSold} units sold with ${product.quantity} still available, so it can support a campaign without creating a stock-out.`,
      revenue: product.revenue,
      stock: product.quantity
    }));

  const restockPriorities = rankedProducts
    .filter((product) => product.status !== "healthy")
    .sort((left, right) => right.unitsSold - left.unitsSold || left.quantity - right.quantity)
    .slice(0, 4)
    .map((product) => ({
      name: product.name,
      category: product.category,
      action: "Restock",
      reason: `${product.quantity} units remain against a reorder level of ${product.reorderLevel}.`,
      revenue: product.revenue,
      stock: product.quantity
    }));

  const slowMovers = rankedProducts
    .filter((product) => product.quantity >= Math.max(product.reorderLevel * 2, 8) && product.unitsSold <= 1)
    .sort((left, right) => right.quantity - left.quantity)
    .slice(0, 4)
    .map((product) => ({
      name: product.name,
      category: product.category,
      action: "Bundle or discount",
      reason: `${product.quantity} units are tied up in stock with limited recent movement.`,
      revenue: product.revenue,
      stock: product.quantity
    }));

  const cheapest = [...rankedProducts].sort((left, right) => left.price - right.price)[0] || null;
  const premium = [...rankedProducts].sort((left, right) => right.price - left.price)[0] || null;
  const bestseller = [...rankedProducts].sort((left, right) => right.unitsSold - left.unitsSold)[0] || null;

  return {
    featured,
    restockPriorities,
    slowMovers,
    bundleIdeas: findBundleIdeas(rankedProducts),
    spotlight: {
      cheapest,
      premium,
      bestseller
    }
  };
}

function buildCustomerInsights(normalizedSales) {
  const customersMap = new Map();

  normalizedSales.forEach((sale) => {
    const customerName = normalizeText(sale.customerName) || "Walk-in Customer";
    const customerKey = normalizeText(sale.mobile) || customerName.toLowerCase();
    const current = customersMap.get(customerKey) || {
      customerName,
      mobile: sale.mobile || "",
      orderCount: 0,
      revenue: 0,
      unitsBought: 0,
      products: new Set(),
      lastPurchaseAt: null
    };

    current.orderCount += 1;
    current.revenue += toNumber(sale.totalPrice);
    current.unitsBought += toNumber(sale.quantity);
    current.products.add(sale.productName);

    if (!current.lastPurchaseAt || new Date(sale.date) > new Date(current.lastPurchaseAt)) {
      current.lastPurchaseAt = sale.date;
    }

    customersMap.set(customerKey, current);
  });

  const customers = Array.from(customersMap.values())
    .map((customer) => ({
      ...customer,
      products: Array.from(customer.products),
      revenue: roundCurrency(customer.revenue)
    }))
    .sort((left, right) => right.revenue - left.revenue);

  const repeatCustomers = customers.filter((customer) => customer.orderCount > 1);
  const vipCustomers = customers.filter((customer) => customer.revenue >= average(customers.map((item) => item.revenue)) * 1.25);

  return {
    totals: {
      totalCustomers: customers.length,
      repeatCustomers: repeatCustomers.length,
      vipCustomers: vipCustomers.length,
      averageSpend: roundCurrency(average(customers.map((customer) => customer.revenue)))
    },
    topCustomers: customers.slice(0, 6),
    segments: [
      {
        title: "VIP customers",
        description: "High-value buyers worth proactive follow-up and early access messages.",
        count: vipCustomers.length,
        customers: vipCustomers.slice(0, 3).map((customer) => customer.customerName)
      },
      {
        title: "Repeat buyers",
        description: "Customers with more than one order who are strongest for retention campaigns.",
        count: repeatCustomers.length,
        customers: repeatCustomers.slice(0, 3).map((customer) => customer.customerName)
      },
      {
        title: "New buyers",
        description: "Recent one-time buyers who are ideal for a thank-you note and second-purchase offer.",
        count: customers.filter((customer) => customer.orderCount === 1).length,
        customers: customers
          .filter((customer) => customer.orderCount === 1)
          .slice(0, 3)
          .map((customer) => customer.customerName)
      }
    ],
    opportunities: [
      "Send a thank-you follow-up to new buyers within 24 hours of purchase.",
      "Offer a bundle to repeat buyers using complementary accessories they have not purchased yet.",
      "Prioritize VIP customers for back-in-stock alerts and early product updates."
    ]
  };
}

function buildCustomerServiceSummary(normalizedProducts, normalizedSales) {
  const customerInsights = buildCustomerInsights(normalizedSales);
  const inStockProduct = normalizedProducts.find((product) => product.status === "healthy");
  const lowStockProduct = normalizedProducts.find((product) => product.status !== "healthy");
  const topSellingProduct = [...buildRecommendationBoard(normalizedProducts, normalizedSales).featured][0];

  const templates = [
    {
      id: "availability",
      title: "Availability response",
      description: "Instant stock confirmation with price and reserve-ready language.",
      preview: inStockProduct
        ? `Hi there, yes, ${inStockProduct.name} is available at ${formatCurrency(inStockProduct.price)}. We currently have ${inStockProduct.quantity} units ready today.`
        : "Hi there, I can confirm live stock and pricing for any item in the catalog."
    },
    {
      id: "restock",
      title: "Back-in-stock reassurance",
      description: "Respond clearly when an item is low or unavailable and set the next step.",
      preview: lowStockProduct
        ? `Hi there, ${lowStockProduct.name} is currently limited to ${lowStockProduct.quantity} units. I can help reserve one or suggest the closest alternative.`
        : "Hi there, I can help with restock status and alternative options for any product."
    },
    {
      id: "thank-you",
      title: "Post-purchase thank-you",
      description: "Send a warm follow-up after a sale to encourage a second order.",
      preview: "Thank you for shopping with us. If you need help with setup, repeat purchases, or matching accessories, just reply here."
    },
    {
      id: "upsell",
      title: "Upsell suggestion",
      description: "Recommend a complementary product while inventory is healthy.",
      preview: topSellingProduct
        ? `A popular add-on right now is ${topSellingProduct.name}. It is selling well and still in stock if you would like a bundle suggestion.`
        : "I can recommend complementary items based on popular products and stock availability."
    }
  ];

  return {
    totals: {
      readyTemplates: templates.length,
      repeatCustomers: customerInsights.totals.repeatCustomers,
      vipCustomers: customerInsights.totals.vipCustomers
    },
    templates,
    automations: [
      {
        title: "Back-in-stock alert flow",
        description: "Notify interested customers when a low-stock item becomes available again."
      },
      {
        title: "Thank-you follow-up flow",
        description: "Send a quick support and cross-sell note after purchase."
      },
      {
        title: "VIP early-access flow",
        description: "Message high-value customers first when premium items are available."
      }
    ]
  };
}

function createCustomerServiceContext(products, sales) {
  const normalizedProducts = products
    .filter((product) => !NOISE_PRODUCT_PATTERN.test(product.name || ""))
    .map(normalizeProduct);
  const normalizedSales = sales
    .filter((sale) => !NOISE_PRODUCT_PATTERN.test(sale.productName || ""))
    .map(normalizeSale)
    .sort(
    (left, right) => new Date(right.date) - new Date(left.date)
  );

  return {
    products: normalizedProducts,
    sales: normalizedSales,
    recommendations: buildRecommendationBoard(normalizedProducts, normalizedSales)
  };
}

function findProductByReference(context, reference) {
  const normalizedReference = normalizeText(reference).toLowerCase();

  if (!normalizedReference) {
    return null;
  }

  return (
    context.products.find((product) => product.id === normalizedReference) ||
    context.products.find(
      (product) =>
        normalizeText(product.name).toLowerCase() === normalizedReference ||
        normalizeText(product.sku).toLowerCase() === normalizedReference
    ) ||
    context.products.find((product) =>
      normalizeText(product.name).toLowerCase().includes(normalizedReference)
    ) ||
    null
  );
}

function generateCustomerServiceReply(input, context) {
  const type = normalizeText(input.type).toLowerCase() || "availability";
  const customerName = normalizeText(input.customerName) || "there";
  const product =
    findProductByReference(context, input.productId) ||
    findProductByReference(context, input.productName);
  const featuredProduct = context.recommendations.featured[0];
  const alternativeProduct = context.products.find(
    (item) => item.status === "healthy" && item.id !== product?.id
  );

  if (type === "thank-you") {
    return `Hi ${customerName}, thank you for shopping with us. If you need help with your recent purchase${product ? ` of ${product.name}` : ""}, we are here for you. Reply anytime if you would like matching accessories or a repeat order.`;
  }

  if (type === "upsell") {
    const suggestion = alternativeProduct || product || context.products[0];

    return suggestion
      ? `Hi ${customerName}, a strong add-on option right now is ${suggestion.name} at ${formatCurrency(suggestion.price)}. It is currently ${suggestion.status === "healthy" ? "in stock" : "limited in stock"}, and it pairs well with everyday retail purchases.`
      : `Hi ${customerName}, I can help you with add-on suggestions based on what is currently available in stock.`;
  }

  if (!product) {
    return `Hi ${customerName}, I could not confidently identify the product from the current catalog. Please share the exact item name and I will check the latest stock and pricing for you.`;
  }

  if (type === "restock") {
    if (product.quantity > 0) {
      return `Hi ${customerName}, ${product.name} is currently available with ${product.quantity} units left at ${formatCurrency(product.price)}. I can help reserve one right away if you would like.`;
    }

    return `Hi ${customerName}, ${product.name} is out of stock at the moment. We are prioritizing replenishment for this item${alternativeProduct ? `, and a good alternative available now is ${alternativeProduct.name} at ${formatCurrency(alternativeProduct.price)}` : ""}.`;
  }

  if (type === "follow-up") {
    return `Hi ${customerName}, just checking in after your recent purchase${product ? ` of ${product.name}` : ""}. If you need setup help, a repeat order, or a matching accessory recommendation, I would be happy to help.`;
  }

  return `Hi ${customerName}, ${product.name} is currently ${product.quantity > 0 ? "available" : "out of stock"}${product.quantity > 0 ? ` with ${product.quantity} units ready` : ""} at ${formatCurrency(product.price)}. ${featuredProduct ? `A popular related product right now is ${featuredProduct.name}.` : ""}`;
}

function buildRetailIntelligenceSummary(products = [], sales = []) {
  const normalizedProducts = products
    .filter((product) => !NOISE_PRODUCT_PATTERN.test(product.name || ""))
    .map(normalizeProduct);
  const normalizedSales = sales
    .filter((sale) => !NOISE_PRODUCT_PATTERN.test(sale.productName || ""))
    .map(normalizeSale)
    .sort((left, right) => new Date(right.date) - new Date(left.date));

  const overview = buildAnalyticsSummary(normalizedProducts, normalizedSales);
  const forecast = buildForecast(normalizedSales);
  const productRecommendations = buildRecommendationBoard(
    normalizedProducts,
    normalizedSales
  );
  const customerInsights = buildCustomerInsights(normalizedSales);
  const customerService = buildCustomerServiceSummary(
    normalizedProducts,
    normalizedSales
  );

  return {
    ...overview,
    forecast,
    productRecommendations,
    customerInsights,
    customerService
  };
}

module.exports = {
  buildRetailIntelligenceSummary,
  createCustomerServiceContext,
  generateCustomerServiceReply
};
