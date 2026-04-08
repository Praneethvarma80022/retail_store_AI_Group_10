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

const HISTORY_DAYS = 21;
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

function percentChange(current, previous) {
  if (!previous) {
    return current > 0 ? 100 : 0;
  }

  return ((current - previous) / previous) * 100;
}

function isWeekend(date) {
  return [0, 6].includes(new Date(date).getDay());
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
      label: current.toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
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

function buildWeekdayProfile(history) {
  const profile = new Map(
    Array.from({ length: 7 }, (_, day) => [
      day,
      {
        revenue: 0,
        orders: 0,
        units: 0,
        count: 0
      }
    ])
  );

  history.forEach((day) => {
    const weekday = new Date(day.date).getDay();
    const current = profile.get(weekday);
    current.revenue += toNumber(day.revenue);
    current.orders += toNumber(day.orders);
    current.units += toNumber(day.units);
    current.count += 1;
  });

  return profile;
}

function buildForecast(normalizedSales) {
  const history = buildDailyBuckets(normalizedSales, HISTORY_DAYS);
  const recentWindow = history.slice(-FORECAST_DAYS);
  const previousWindow = history.slice(-FORECAST_DAYS * 2, -FORECAST_DAYS);
  const weekdayProfile = buildWeekdayProfile(history);

  const recentRevenueAverage = average(recentWindow.map((day) => day.revenue));
  const recentOrderAverage = average(recentWindow.map((day) => day.orders));
  const recentUnitsAverage = average(recentWindow.map((day) => day.units));
  const previousRevenueAverage = average(previousWindow.map((day) => day.revenue));
  const previousOrderAverage = average(previousWindow.map((day) => day.orders));
  const previousUnitsAverage = average(previousWindow.map((day) => day.units));
  const revenueTrend = recentRevenueAverage - previousRevenueAverage;
  const orderTrend = recentOrderAverage - previousOrderAverage;
  const unitsTrend = recentUnitsAverage - previousUnitsAverage;
  const revenueVolatility = standardDeviation(recentWindow.map((day) => day.revenue));
  const volatilityRatio = recentRevenueAverage
    ? revenueVolatility / recentRevenueAverage
    : 1;
  const historySalesDays = history.filter((day) => day.orders > 0).length;
  const weekendRevenueAverage = average(
    history.filter((day) => isWeekend(day.date)).map((day) => day.revenue)
  );
  const weekdayRevenueAverage = average(
    history.filter((day) => !isWeekend(day.date)).map((day) => day.revenue)
  );
  const weekendUpliftRatio =
    weekendRevenueAverage && weekdayRevenueAverage
      ? weekendRevenueAverage / weekdayRevenueAverage
      : 1;
  const revenueTrendPercent = percentChange(
    recentRevenueAverage,
    previousRevenueAverage
  );
  const orderTrendPercent = percentChange(recentOrderAverage, previousOrderAverage);

  const confidenceScore = clamp(
    84 - volatilityRatio * 28 + historySalesDays * 1.8 + normalizedSales.length * 0.35,
    38,
    94
  );
  const scenarioSpread = clamp(0.1 + volatilityRatio * 0.14, 0.08, 0.28);

  const forecastDays = Array.from({ length: FORECAST_DAYS }, (_, index) => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() + index + 1);

    const weekdayStats = weekdayProfile.get(date.getDay()) || {
      revenue: recentRevenueAverage,
      orders: recentOrderAverage,
      units: recentUnitsAverage,
      count: 1
    };
    const weekdayRevenueAverageForDay = weekdayStats.count
      ? weekdayStats.revenue / weekdayStats.count
      : recentRevenueAverage;
    const weekdayOrderAverageForDay = weekdayStats.count
      ? weekdayStats.orders / weekdayStats.count
      : recentOrderAverage;
    const weekdayUnitsAverageForDay = weekdayStats.count
      ? weekdayStats.units / weekdayStats.count
      : recentUnitsAverage;
    const trendFactor = 0.18 + index * 0.04;
    const weekendFactor = isWeekend(date)
      ? clamp(weekendUpliftRatio || 1, 0.92, 1.16)
      : 1;
    const projectedRevenue = Math.max(
      recentRevenueAverage * 0.58 +
        weekdayRevenueAverageForDay * 0.42 +
        revenueTrend * trendFactor,
      0
    );
    const projectedOrders = Math.max(
      recentOrderAverage * 0.62 +
        weekdayOrderAverageForDay * 0.38 +
        orderTrend * trendFactor,
      0
    );
    const projectedUnits = Math.max(
      recentUnitsAverage * 0.58 +
        weekdayUnitsAverageForDay * 0.42 +
        unitsTrend * trendFactor,
      0
    );

    return {
      date: date.toISOString(),
      label: date.toLocaleDateString("en-IN", { weekday: "short", day: "numeric" }),
      projectedRevenue: roundCurrency(projectedRevenue * weekendFactor),
      projectedOrders: Math.max(Math.round(projectedOrders * weekendFactor), 0),
      projectedUnits: Math.max(Math.round(projectedUnits * weekendFactor), 0)
    };
  });

  const expectedRevenue = roundCurrency(
    forecastDays.reduce((sum, day) => sum + day.projectedRevenue, 0)
  );
  const expectedOrders = forecastDays.reduce(
    (sum, day) => sum + day.projectedOrders,
    0
  );
  const expectedUnits = forecastDays.reduce(
    (sum, day) => sum + day.projectedUnits,
    0
  );
  const conservativeRevenue = roundCurrency(expectedRevenue * (1 - scenarioSpread));
  const optimisticRevenue = roundCurrency(expectedRevenue * (1 + scenarioSpread));
  const conservativeOrders = Math.max(
    Math.round(expectedOrders * (1 - scenarioSpread * 0.85)),
    0
  );
  const optimisticOrders = Math.max(
    Math.round(expectedOrders * (1 + scenarioSpread * 0.85)),
    0
  );
  const activeHistoryDays = history.filter((day) => day.orders > 0);
  const topHistoryDay =
    [...activeHistoryDays].sort((left, right) => right.revenue - left.revenue)[0] || null;
  const lowHistoryDay =
    [...activeHistoryDays].sort((left, right) => left.revenue - right.revenue)[0] || null;
  const risks = [];
  const recommendations = [];

  if (!normalizedSales.length) {
    risks.push("Forecast confidence is limited because there are no completed sales in history yet.");
    recommendations.push("Record a few real sales first so the forecast can learn demand patterns.");
  }

  if (historySalesDays < 5 && normalizedSales.length) {
    risks.push("Sales history is still sparse, so the forecast should be treated as directional guidance.");
  }

  if (volatilityRatio >= 0.9) {
    risks.push("Daily revenue is highly volatile, so the range between conservative and optimistic scenarios is wider.");
  }

  if (revenueTrendPercent > 8) {
    recommendations.push("Recent demand is improving, so prepare inventory and staffing for a stronger next week.");
  } else if (revenueTrendPercent < -8) {
    recommendations.push("Demand has softened versus the previous week, so review promotions and follow-up campaigns.");
  } else {
    recommendations.push("Demand is stable, so use the base forecast as an operating benchmark for the next week.");
  }

  recommendations.push(
    "Use the conservative scenario for cash-flow planning and the optimistic scenario for stretch sales targets."
  );

  return {
    history,
    next7Days: forecastDays,
    summary: {
      expectedRevenue,
      expectedOrders,
      expectedUnits,
      dailyAverageRevenue: roundCurrency(recentRevenueAverage),
      dailyAverageOrders: roundCurrency(recentOrderAverage),
      dailyAverageUnits: roundCurrency(recentUnitsAverage),
      trendDirection:
        revenueTrendPercent > 8 ? "upward" : revenueTrendPercent < -8 ? "softening" : "steady",
      confidenceScore: Math.round(confidenceScore),
      confidenceLabel:
        confidenceScore >= 80
          ? "High confidence"
          : confidenceScore >= 62
            ? "Moderate confidence"
            : "Early signal",
      method: "Blended weekday baseline with recent trend adjustment",
      baselineWindow: `${HISTORY_DAYS} days`,
      dataCoveragePercent: Math.round((historySalesDays / Math.max(HISTORY_DAYS, 1)) * 100),
      revenueRange: {
        low: conservativeRevenue,
        high: optimisticRevenue
      },
      orderRange: {
        low: conservativeOrders,
        high: optimisticOrders
      }
    },
    breakdown: {
      recentAverageRevenue: roundCurrency(recentRevenueAverage),
      previousAverageRevenue: roundCurrency(previousRevenueAverage),
      recentAverageOrders: roundCurrency(recentOrderAverage),
      previousAverageOrders: roundCurrency(previousOrderAverage),
      revenueTrendAmount: roundCurrency(revenueTrend),
      revenueTrendPercent: roundCurrency(revenueTrendPercent),
      orderTrendPercent: roundCurrency(orderTrendPercent),
      weekendUpliftPercent: roundCurrency((weekendUpliftRatio - 1) * 100),
      volatilityPercent: roundCurrency(volatilityRatio * 100),
      daysWithSales: historySalesDays,
      totalHistoryDays: HISTORY_DAYS,
      topHistoryDay,
      lowHistoryDay
    },
    scenarios: [
      {
        name: "Conservative",
        revenue: conservativeRevenue,
        orders: conservativeOrders,
        note: "Use this for cautious planning when demand is uncertain."
      },
      {
        name: "Base",
        revenue: expectedRevenue,
        orders: expectedOrders,
        note: "This is the main planning scenario based on current momentum."
      },
      {
        name: "Optimistic",
        revenue: optimisticRevenue,
        orders: optimisticOrders,
        note: "Use this as an upside target if recent momentum continues."
      }
    ],
    methodology: [
      `The model studies the last ${HISTORY_DAYS} days of completed sales to build a daily demand baseline.`,
      "It compares the most recent 7 days with the previous 7 days to detect short-term growth or slowdown.",
      "It blends recent averages with same-weekday behavior so weekday and weekend patterns are reflected in the forecast.",
      "Confidence is reduced when sales are sparse or highly volatile, and increased when the data is consistent."
    ],
    risks,
    recommendations
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

function buildAlerts(overview, forecast, customerInsights, customerService) {
  const alerts = [];
  const todaySales = forecast?.history?.at?.(-1);

  if (overview?.totals?.outOfStockCount > 0) {
    alerts.push({
      id: "out-of-stock",
      tone: "attention",
      title: "Out-of-stock items need action",
      description: `${overview.totals.outOfStockCount} products are already out of stock. Restocking them will protect ongoing sales.`,
      actionLabel: "Open inventory",
      actionPath: "/store"
    });
  }

  if (overview?.totals?.lowStockCount > 0) {
    alerts.push({
      id: "low-stock",
      tone: "attention",
      title: "Low-stock risk detected",
      description: `${overview.totals.lowStockCount} items are below the safe stock threshold and should be reviewed soon.`,
      actionLabel: "Review stock",
      actionPath: "/store"
    });
  }

  if (forecast?.summary?.trendDirection === "softening") {
    alerts.push({
      id: "forecast-softening",
      tone: "attention",
      title: "Sales forecast is softening",
      description: `The next 7-day forecast suggests softer demand with ${forecast.summary.confidenceLabel.toLowerCase()}.`,
      actionLabel: "Open forecast",
      actionPath: "/forecasting"
    });
  }

  if (todaySales && todaySales.orders === 0 && overview?.totals?.totalOrders > 0) {
    alerts.push({
      id: "quiet-day",
      tone: "neutral",
      title: "No sales recorded today",
      description: "Today is currently quiet. A quick offer or follow-up campaign could improve same-day orders.",
      actionLabel: "Open chatbot",
      actionPath: "/assistant"
    });
  }

  if ((customerInsights?.totals?.repeatCustomers || 0) === 0 && overview?.totals?.totalOrders >= 3) {
    alerts.push({
      id: "repeat-customers",
      tone: "neutral",
      title: "Repeat-buyer retention is low",
      description: "The store has sales activity, but repeat buyers are still limited. Follow-up automation can help retention.",
      actionLabel: "Open customer care",
      actionPath: "/customer-service"
    });
  }

  if ((customerService?.totals?.readyTemplates || 0) > 0) {
    alerts.push({
      id: "automation-ready",
      tone: "positive",
      title: "Customer-service automations are ready",
      description: `${customerService.totals.readyTemplates} response templates are prepared from live store data for faster support replies.`,
      actionLabel: "Open customer care",
      actionPath: "/customer-service"
    });
  }

  return alerts.slice(0, 5);
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
    customerService,
    alerts: buildAlerts(overview, forecast, customerInsights, customerService)
  };
}

module.exports = {
  buildRetailIntelligenceSummary,
  createCustomerServiceContext,
  generateCustomerServiceReply
};
