const axios = require("axios");

const {
  formatCurrency,
  formatDate,
  roundCurrency,
  toNumber
} = require("./analytics");
const { buildRetailIntelligenceSummary } = require("./retailIntelligence");
const { normalizeText } = require("./validators");

const GEMINI_API_KEY =
  process.env.GEMINI_API_KEY ||
  process.env.GOOGLE_API_KEY ||
  process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
  "";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const REQUEST_TIMEOUT_MS = 15000;
const GEMINI_MAX_OUTPUT_TOKENS = Number(process.env.GEMINI_MAX_OUTPUT_TOKENS) || 900;
const MAX_LIST_ITEMS = 6;
const MAX_DETAILED_LIST_ITEMS = 20;
const ASSISTANT_NAME = "Retail Intelligence Assistant";
const NOISE_PRODUCT_PATTERN = /\b(codex|verify product|test accessory|debug product|sample item)\b/i;
const CUSTOMER_LOOKUP_WORDS = new Set([
  "a",
  "all",
  "an",
  "and",
  "any",
  "are",
  "average",
  "best",
  "bought",
  "buy",
  "buyer",
  "buyers",
  "buys",
  "by",
  "called",
  "client",
  "clients",
  "count",
  "customer",
  "customers",
  "details",
  "did",
  "do",
  "does",
  "for",
  "from",
  "give",
  "had",
  "has",
  "have",
  "history",
  "i",
  "insights",
  "is",
  "item",
  "items",
  "last",
  "latest",
  "list",
  "made",
  "make",
  "many",
  "me",
  "month",
  "monthly",
  "much",
  "name",
  "named",
  "of",
  "order",
  "orders",
  "our",
  "person",
  "placed",
  "please",
  "product",
  "products",
  "purchase",
  "purchased",
  "purchases",
  "recent",
  "revenue",
  "sale",
  "sales",
  "sell",
  "sold",
  "shopping",
  "show",
  "store",
  "summary",
  "tell",
  "the",
  "this",
  "to",
  "today",
  "top",
  "was",
  "we",
  "week",
  "weekly",
  "were",
  "what",
  "which",
  "who",
  "with",
  "yesterday"
]);

const ASSISTANT_CAPABILITIES = [
  {
    title: "Inventory intelligence",
    description: "Find cheapest items, highest stock, low stock, out-of-stock products, and current inventory value."
  },
  {
    title: "Sales visibility",
    description: "Answer total revenue, recent sales, best sellers, slow movers, and date-based sales summaries."
  },
  {
    title: "Product-level answers",
    description: "Explain price, stock, sales performance, and customers for a specific product."
  },
  {
    title: "Customer purchase history",
    description: "Find what a customer bought by name or mobile number, including quantities, spend, and last purchase dates."
  },
  {
    title: "Comparisons and recommendations",
    description: "Compare two products and suggest restocking or sales priorities based on current data."
  }
];

function normalizeForMatch(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value) {
  return normalizeForMatch(value)
    .split(" ")
    .filter((token) => token.length > 1);
}

function normalizeDigits(value) {
  return normalizeText(value).replace(/\D/g, "");
}

function hasAny(query, phrases) {
  const normalizedQuery = normalizeForMatch(query);
  return phrases.some((phrase) => normalizedQuery.includes(normalizeForMatch(phrase)));
}

function pluralize(count, singular, plural) {
  return `${count} ${count === 1 ? singular : plural || `${singular}s`}`;
}

function sanitizeAssistantReply(reply) {
  return String(reply || "")
    .replace(/\b(?:codex|chatgpt)\b/gi, ASSISTANT_NAME)
    .replace(/\b(?:openai assistant|gpt assistant)\b/gi, ASSISTANT_NAME);
}

function extractComparisonTargets(query) {
  const parts = normalizeText(query)
    .replace(/\bcompare\b/gi, " ")
    .split(/\b(?:vs|versus)\b/i)
    .map((part) => normalizeText(part))
    .filter(Boolean);

  return parts.slice(0, 2);
}

function buildTopCustomers(sales) {
  const customers = new Map();

  sales.forEach((sale) => {
    const customerName = normalizeText(sale.customerName) || "Walk-in Customer";
    const current = customers.get(customerName) || {
      customerName,
      orderCount: 0,
      unitsBought: 0,
      revenue: 0
    };

    current.orderCount += 1;
    current.unitsBought += toNumber(sale.quantity);
    current.revenue += toNumber(sale.totalPrice);

    customers.set(customerName, current);
  });

  return Array.from(customers.values())
    .map((entry) => ({
      ...entry,
      revenue: roundCurrency(entry.revenue)
    }))
    .sort((left, right) => right.revenue - left.revenue);
}

function buildPurchaseSummary(sales) {
  const products = new Map();

  sales.forEach((sale) => {
    const productName = normalizeText(sale.productName) || "Unknown product";
    const current = products.get(productName) || {
      productName,
      quantity: 0,
      revenue: 0,
      orderCount: 0,
      lastPurchaseAt: null
    };

    current.quantity += toNumber(sale.quantity);
    current.revenue += toNumber(sale.totalPrice);
    current.orderCount += 1;

    if (!current.lastPurchaseAt || new Date(sale.date) > new Date(current.lastPurchaseAt)) {
      current.lastPurchaseAt = sale.date;
    }

    products.set(productName, current);
  });

  return Array.from(products.values())
    .map((product) => ({
      ...product,
      revenue: roundCurrency(product.revenue)
    }))
    .sort((left, right) => new Date(right.lastPurchaseAt || 0) - new Date(left.lastPurchaseAt || 0));
}

function buildCustomerProfiles(sales) {
  const customers = new Map();

  sales.forEach((sale) => {
    const customerName = normalizeText(sale.customerName) || "Walk-in Customer";
    const mobile = normalizeText(sale.mobile);
    const mobileDigits = normalizeDigits(mobile);
    const customerKey = mobileDigits
      ? `mobile:${mobileDigits}`
      : `name:${normalizeForMatch(customerName)}`;
    const current = customers.get(customerKey) || {
      customerName,
      displayNames: new Set(),
      matchNames: new Set(),
      matchTokens: new Set(),
      mobiles: new Set(),
      mobileDigits: new Set(),
      orderCount: 0,
      unitsBought: 0,
      revenue: 0,
      recentSales: [],
      lastPurchaseAt: null
    };

    current.customerName = customerName || current.customerName;
    current.displayNames.add(customerName);
    current.matchNames.add(normalizeForMatch(customerName));
    tokenize(customerName).forEach((token) => current.matchTokens.add(token));

    if (mobile) {
      current.mobiles.add(mobile);
    }

    if (mobileDigits) {
      current.mobileDigits.add(mobileDigits);
    }

    current.orderCount += 1;
    current.unitsBought += toNumber(sale.quantity);
    current.revenue += toNumber(sale.totalPrice);
    current.recentSales.push(sale);

    if (!current.lastPurchaseAt || new Date(sale.date) > new Date(current.lastPurchaseAt)) {
      current.lastPurchaseAt = sale.date;
    }

    customers.set(customerKey, current);
  });

  return Array.from(customers.values())
    .map((customer) => {
      const recentSales = customer.recentSales.sort(
        (left, right) => new Date(right.date) - new Date(left.date)
      );
      const matchNames = Array.from(customer.matchNames).filter(Boolean);
      const primaryMatchName = matchNames[0] || normalizeForMatch(customer.customerName);

      return {
        customerName: customer.customerName,
        displayNames: Array.from(customer.displayNames).filter(Boolean),
        matchName: primaryMatchName,
        matchNames,
        matchTokens: Array.from(customer.matchTokens),
        mobiles: Array.from(customer.mobiles),
        mobileDigits: Array.from(customer.mobileDigits),
        orderCount: customer.orderCount,
        unitsBought: customer.unitsBought,
        revenue: roundCurrency(customer.revenue),
        products: buildPurchaseSummary(recentSales),
        recentSales,
        lastPurchaseAt: customer.lastPurchaseAt
      };
    })
    .sort((left, right) => right.revenue - left.revenue);
}

function buildProductStats(products, sales) {
  const statsById = new Map();
  const productsByNormalizedName = new Map();

  products.forEach((product) => {
    productsByNormalizedName.set(normalizeForMatch(product.name), product);
    statsById.set(product.id, {
      unitsSold: 0,
      revenue: 0,
      orderCount: 0,
      customers: new Set(),
      recentSales: [],
      lastSoldAt: null
    });
  });

  sales.forEach((sale) => {
    const matchedProduct =
      products.find((product) => product.id === sale.productId) ||
      productsByNormalizedName.get(normalizeForMatch(sale.productName));

    if (!matchedProduct) {
      return;
    }

    const current = statsById.get(matchedProduct.id);
    current.unitsSold += toNumber(sale.quantity);
    current.revenue += toNumber(sale.totalPrice);
    current.orderCount += 1;

    if (sale.customerName) {
      current.customers.add(sale.customerName);
    }

    current.recentSales.push(sale);

    if (!current.lastSoldAt || new Date(sale.date) > new Date(current.lastSoldAt)) {
      current.lastSoldAt = sale.date;
    }
  });

  statsById.forEach((stats) => {
    stats.revenue = roundCurrency(stats.revenue);
    stats.recentSales = stats.recentSales
      .sort((left, right) => new Date(right.date) - new Date(left.date))
      .slice(0, 5);
    stats.customers = Array.from(stats.customers);
  });

  return statsById;
}

function getLatestTimestamp(items, fields) {
  return items.reduce((latest, item) => {
    const timestamp = fields
      .map((field) => item[field])
      .filter(Boolean)
      .sort((left, right) => new Date(right) - new Date(left))[0];

    if (!timestamp) {
      return latest;
    }

    return !latest || new Date(timestamp) > new Date(latest) ? timestamp : latest;
  }, "");
}

function buildAssistantContext(products, sales) {
  const cleanProducts = products.filter((product) => !NOISE_PRODUCT_PATTERN.test(product.name || ""));
  const cleanSales = sales.filter((sale) => !NOISE_PRODUCT_PATTERN.test(sale.productName || ""));
  const analytics = buildRetailIntelligenceSummary(cleanProducts, cleanSales);
  const enrichedProducts = cleanProducts.map((product) => ({
    ...product,
    matchName: normalizeForMatch(product.name),
    matchTokens: tokenize(product.name)
  }));
  const sortedProductsByPrice = [...enrichedProducts].sort(
    (left, right) => left.price - right.price
  );
  const availableProducts = sortedProductsByPrice.filter((product) => product.quantity > 0);
  const topCustomers = buildTopCustomers(cleanSales).slice(0, 5);
  const customerProfiles = buildCustomerProfiles(cleanSales);
  const productStatsById = buildProductStats(enrichedProducts, cleanSales);
  const dataVersion = [
    cleanProducts.length,
    cleanSales.length,
    analytics.totals.totalRevenue,
    analytics.totals.inventoryValue,
    getLatestTimestamp(cleanProducts, ["updatedAt", "createdAt"]),
    getLatestTimestamp(cleanSales, ["updatedAt", "createdAt", "date"])
  ].join("|");

  return {
    analytics,
    products: enrichedProducts,
    sales: cleanSales,
    availableProducts,
    productStatsById,
    topCustomers,
    customerProfiles,
    dataVersion
  };
}

function findMatchedProducts(query, context) {
  const normalizedQuery = normalizeForMatch(query);
  const queryTokens = new Set(tokenize(query));

  const matches = context.products
    .map((product) => {
      let score = 0;

      if (normalizedQuery.includes(product.matchName)) {
        score += 120 + product.matchName.length;
      }

      const matchedTokens = product.matchTokens.filter((token) => queryTokens.has(token));

      if (matchedTokens.length > 0) {
        score += matchedTokens.length * 12;

        if (matchedTokens.length === product.matchTokens.length) {
          score += 24;
        }
      }

      if (product.matchTokens.length === 1 && normalizedQuery.includes(product.matchTokens[0])) {
        score += 16;
      }

      return {
        product,
        score
      };
    })
    .filter((entry) => entry.score >= 12)
    .sort((left, right) => right.score - left.score);

  const unique = [];
  const seen = new Set();

  matches.forEach((entry) => {
    if (!seen.has(entry.product.id)) {
      seen.add(entry.product.id);
      unique.push(entry.product);
    }
  });

  return unique;
}

function getProductStats(context, product) {
  return (
    context.productStatsById.get(product.id) || {
      unitsSold: 0,
      revenue: 0,
      orderCount: 0,
      customers: [],
      recentSales: [],
      lastSoldAt: null
    }
  );
}

function extractCustomerLookupText(query) {
  return normalizeForMatch(query)
    .split(" ")
    .filter((token) => token.length > 1 && !CUSTOMER_LOOKUP_WORDS.has(token))
    .join(" ")
    .trim();
}

function isCustomerLookupQuery(query) {
  return hasAny(query, [
    "what did",
    "what product did",
    "what products did",
    "which product did",
    "which products did",
    "what item did",
    "what items did",
    "which item did",
    "which items did",
    "who did",
    "products bought",
    "products purchased",
    "items bought",
    "items purchased",
    "purchase history",
    "order history",
    "orders by",
    "orders for",
    "purchases by",
    "purchases for",
    "bought by",
    "purchased by",
    "sales to",
    "sales by",
    "customer bought",
    "customer purchased",
    "customer orders",
    "customer purchases"
  ]);
}

function hasExplicitCustomerPurchaseCue(query) {
  return hasAny(query, [
    "buy",
    "bought",
    "purchase",
    "purchased",
    "purchases",
    "order",
    "orders",
    "customer",
    "buyer",
    "sales to",
    "sales by"
  ]);
}

function isCustomerListQuery(query) {
  const normalizedQuery = normalizeForMatch(query);

  return (
    normalizedQuery === "customers" ||
    hasAny(query, [
      "list customers",
      "list all customers",
      "all customers",
      "show customers",
      "show all customers",
      "customer list",
      "customers list",
      "known customers",
      "customer directory",
      "customer names",
      "list customer names",
      "show customer names"
    ])
  );
}

function isCustomerCountQuery(query) {
  return hasAny(query, [
    "how many customers",
    "number of customers",
    "customer count",
    "total customers",
    "count customers"
  ]);
}

function isSalesListQuery(query) {
  return hasAny(query, [
    "latest sale",
    "latest sales",
    "latest order",
    "latest orders",
    "recent sale",
    "recent sales",
    "recent order",
    "recent orders",
    "last sale",
    "last sales",
    "last order",
    "last orders",
    "list sales",
    "list all sales",
    "show sales",
    "show all sales",
    "sales list",
    "sales history",
    "order list",
    "orders list",
    "order history",
    "all orders",
    "show all orders"
  ]);
}

function isCatalogListQuery(query) {
  return hasAny(query, [
    "list products",
    "list all products",
    "all products",
    "show products",
    "show all products",
    "product list",
    "products list",
    "full catalog",
    "complete catalog",
    "catalog list"
  ]);
}

function findMatchedCustomers(query, context) {
  const lookupText = extractCustomerLookupText(query);
  const normalizedQuery = normalizeForMatch(query);
  const normalizedLookup = normalizeForMatch(lookupText);
  const queryTokens = new Set(tokenize(lookupText || query));
  const queryDigits = normalizeDigits(query);

  if (!normalizedLookup && !queryDigits) {
    return [];
  }

  return context.customerProfiles
    .map((customer) => {
      let score = 0;

      customer.matchNames.forEach((matchName) => {
        if (!matchName) {
          return;
        }

        if (normalizedLookup === matchName) {
          score += 150;
        }

        if (normalizedQuery.includes(matchName)) {
          score += 130 + matchName.length;
        }

        if (normalizedLookup && matchName.includes(normalizedLookup)) {
          score += 80 + normalizedLookup.length;
        }
      });

      const matchedTokens = customer.matchTokens.filter((token) => queryTokens.has(token));

      if (matchedTokens.length) {
        score += matchedTokens.length * 18;

        if (matchedTokens.length === customer.matchTokens.length) {
          score += 30;
        }
      }

      if (queryDigits.length >= 4) {
        customer.mobileDigits.forEach((mobile) => {
          if (mobile === queryDigits) {
            score += 180;
          } else if (mobile.includes(queryDigits) || queryDigits.includes(mobile)) {
            score += 130;
          }
        });
      }

      return {
        customer,
        score
      };
    })
    .filter((entry) => entry.score >= 18)
    .sort((left, right) => right.score - left.score)
    .map((entry) => entry.customer);
}

function getDateRange(query) {
  const now = new Date();
  const currentDay = new Date(now);
  currentDay.setHours(0, 0, 0, 0);

  if (hasAny(query, ["today"])) {
    return {
      label: "today",
      start: currentDay,
      end: null
    };
  }

  if (hasAny(query, ["yesterday"])) {
    const start = new Date(currentDay);
    start.setDate(start.getDate() - 1);

    return {
      label: "yesterday",
      start,
      end: currentDay
    };
  }

  if (hasAny(query, ["this week", "weekly"])) {
    const start = new Date(currentDay);
    const currentWeekday = (start.getDay() + 6) % 7;
    start.setDate(start.getDate() - currentWeekday);

    return {
      label: "this week",
      start,
      end: null
    };
  }

  if (hasAny(query, ["this month", "monthly"])) {
    const start = new Date(currentDay.getFullYear(), currentDay.getMonth(), 1);

    return {
      label: "this month",
      start,
      end: null
    };
  }

  if (hasAny(query, ["last 7 days", "past 7 days", "last seven days", "past week"])) {
    const start = new Date(currentDay);
    start.setDate(start.getDate() - 6);

    return {
      label: "last 7 days",
      start,
      end: null
    };
  }

  if (hasAny(query, ["last month", "previous month"])) {
    const start = new Date(currentDay.getFullYear(), currentDay.getMonth() - 1, 1);
    const end = new Date(currentDay.getFullYear(), currentDay.getMonth(), 1);

    return {
      label: "last month",
      start,
      end
    };
  }

  return null;
}

function filterSalesByRange(sales, range) {
  if (!range) {
    return sales;
  }

  return sales.filter((sale) => {
    const saleDate = new Date(sale.date);

    if (Number.isNaN(saleDate.getTime())) {
      return false;
    }

    if (saleDate < range.start) {
      return false;
    }

    if (range.end && saleDate >= range.end) {
      return false;
    }

    return true;
  });
}

function buildSalesSummaryReply(sales, rangeLabel) {
  const totalRevenue = roundCurrency(
    sales.reduce((sum, sale) => sum + toNumber(sale.totalPrice), 0)
  );
  const totalOrders = sales.length;
  const totalUnits = sales.reduce((sum, sale) => sum + toNumber(sale.quantity), 0);
  const averageOrderValue = totalOrders ? roundCurrency(totalRevenue / totalOrders) : 0;

  return [
    `Sales summary${rangeLabel ? ` for ${rangeLabel}` : ""}:`,
    `- Revenue: ${formatCurrency(totalRevenue)}`,
    `- Orders: ${pluralize(totalOrders, "order")}`,
    `- Units sold: ${pluralize(totalUnits, "unit")}`,
    `- Average order value: ${formatCurrency(averageOrderValue)}`
  ].join("\n");
}

function formatSaleLine(sale) {
  const customerName = normalizeText(sale.customerName) || "Walk-in Customer";
  const productName = normalizeText(sale.productName) || "Unknown product";
  const mobile = normalizeText(sale.mobile);

  return `- ${customerName}${mobile ? ` (${mobile})` : ""} bought ${productName} x${toNumber(sale.quantity)} for ${formatCurrency(sale.totalPrice)} on ${formatDate(sale.date)}`;
}

function buildSalesListReply(sales, title, options = {}) {
  const limit = options.all ? MAX_DETAILED_LIST_ITEMS : MAX_LIST_ITEMS;

  if (!sales.length) {
    return `No sales were recorded${options.rangeLabel ? ` for ${options.rangeLabel}` : ""}.`;
  }

  const totalRevenue = roundCurrency(
    sales.reduce((sum, sale) => sum + toNumber(sale.totalPrice), 0)
  );
  const totalUnits = sales.reduce((sum, sale) => sum + toNumber(sale.quantity), 0);
  const shownSales = sales.slice(0, limit);

  return [
    `${title}:`,
    `- Showing ${shownSales.length} of ${pluralize(sales.length, "sale")}`,
    `- Total listed revenue: ${formatCurrency(totalRevenue)}`,
    `- Total listed units: ${pluralize(totalUnits, "unit")}`,
    ...shownSales.map(formatSaleLine),
    sales.length > shownSales.length
      ? `- Plus ${sales.length - shownSales.length} more sales. Use the Sales page for the full table/export.`
      : null
  ]
    .filter(Boolean)
    .join("\n");
}

function buildCustomerCountReply(context) {
  return [
    "Customer count:",
    `- Known customers: ${pluralize(context.customerProfiles.length, "customer")}`,
    `- Repeat customers: ${pluralize(context.analytics.customerInsights?.totals?.repeatCustomers || 0, "customer")}`,
    `- VIP customers: ${pluralize(context.analytics.customerInsights?.totals?.vipCustomers || 0, "customer")}`,
    `- Average customer spend: ${formatCurrency(context.analytics.customerInsights?.totals?.averageSpend || 0)}`
  ].join("\n");
}

function buildCustomerListReply(context, options = {}) {
  if (!context.customerProfiles.length) {
    return "No customer purchase history is available yet.";
  }

  const limit = options.all ? MAX_DETAILED_LIST_ITEMS : MAX_LIST_ITEMS;
  const customers = context.customerProfiles.slice(0, limit);

  return [
    options.all ? "All known customers:" : "Known customers:",
    `- Showing ${customers.length} of ${pluralize(context.customerProfiles.length, "customer")}`,
    ...customers.map((customer) => {
      const productNames = customer.products
        .slice(0, 3)
        .map((product) => product.productName)
        .join(", ");
      const productSummary = productNames ? `; products: ${productNames}` : "";
      const mobileSummary = customer.mobiles[0] ? ` (${customer.mobiles[0]})` : "";

      return `- ${customer.customerName}${mobileSummary}: ${pluralize(customer.orderCount, "order")}, ${pluralize(customer.unitsBought, "unit")} bought, ${formatCurrency(customer.revenue)} spent${customer.lastPurchaseAt ? `, last purchase ${formatDate(customer.lastPurchaseAt)}` : ""}${productSummary}`;
    }),
    context.customerProfiles.length > customers.length
      ? `- Plus ${context.customerProfiles.length - customers.length} more customers. Use the Customer Care page for the full customer workspace.`
      : null
  ]
    .filter(Boolean)
    .join("\n");
}

function buildUnknownCustomerReply(target, context) {
  if (!context.customerProfiles.length) {
    return "No customer purchase history is available yet.";
  }

  const knownCustomers = context.customerProfiles
    .slice(0, MAX_LIST_ITEMS)
    .map((customer) => customer.customerName)
    .join(", ");

  return [
    "I could not find that customer in the current purchase history.",
    target ? `- Customer searched: ${target}` : "- Try using the exact customer name or mobile number from sales.",
    knownCustomers
      ? `- Known customers include: ${knownCustomers}`
      : "- Add a sale first so the assistant can build customer history."
  ].join("\n");
}

function buildAmbiguousCustomerReply(customers) {
  return [
    "I found multiple possible customer matches. Please use a full name or mobile number.",
    ...customers
      .slice(0, MAX_LIST_ITEMS)
      .map((customer) => `- ${customer.customerName}${customer.mobiles[0] ? ` (${customer.mobiles[0]})` : ""}`)
  ].join("\n");
}

function buildCustomerPurchaseReply(customer, range) {
  const relevantSales = filterSalesByRange(customer.recentSales, range);

  if (!relevantSales.length) {
    return `${customer.customerName} has no recorded purchases${range ? ` for ${range.label}` : ""}.`;
  }

  const products = buildPurchaseSummary(relevantSales);
  const totalRevenue = roundCurrency(
    relevantSales.reduce((sum, sale) => sum + toNumber(sale.totalPrice), 0)
  );
  const totalUnits = relevantSales.reduce((sum, sale) => sum + toNumber(sale.quantity), 0);
  const lastPurchase = relevantSales[0]?.date;

  return [
    `${customer.customerName} purchase history${range ? ` for ${range.label}` : ""}:`,
    customer.mobiles[0] ? `- Mobile: ${customer.mobiles[0]}` : null,
    `- Orders: ${pluralize(relevantSales.length, "order")}`,
    `- Units bought: ${pluralize(totalUnits, "unit")}`,
    `- Total spend: ${formatCurrency(totalRevenue)}`,
    lastPurchase ? `- Last purchase: ${formatDate(lastPurchase)}` : null,
    ...products.slice(0, MAX_LIST_ITEMS).map(
      (product) =>
        `- ${product.productName}: ${pluralize(product.quantity, "unit")} for ${formatCurrency(product.revenue)}${product.lastPurchaseAt ? `, last bought ${formatDate(product.lastPurchaseAt)}` : ""}`
    ),
    products.length > MAX_LIST_ITEMS
      ? `- Plus ${products.length - MAX_LIST_ITEMS} more products`
      : null
  ]
    .filter(Boolean)
    .join("\n");
}

function buildProductSnapshotReply(product, context) {
  const stats = getProductStats(context, product);

  return [
    `${product.name} snapshot:`,
    `- Price: ${formatCurrency(product.price)}`,
    `- Units available: ${pluralize(product.quantity, "unit")}`,
    `- Stock status: ${product.status.replace(/-/g, " ")}`,
    `- Units sold: ${pluralize(stats.unitsSold, "unit")}`,
    `- Sales revenue: ${formatCurrency(stats.revenue)}`,
    stats.lastSoldAt ? `- Last sold: ${formatDate(stats.lastSoldAt)}` : "- Last sold: no sales recorded yet"
  ].join("\n");
}

function buildComparisonReply(firstProduct, secondProduct, context) {
  const firstStats = getProductStats(context, firstProduct);
  const secondStats = getProductStats(context, secondProduct);
  const cheaperProduct = firstProduct.price <= secondProduct.price ? firstProduct : secondProduct;
  const strongerStock = firstProduct.quantity >= secondProduct.quantity ? firstProduct : secondProduct;
  const strongerSales = firstStats.unitsSold >= secondStats.unitsSold ? firstProduct : secondProduct;

  return [
    `${firstProduct.name} vs ${secondProduct.name}:`,
    `- Price: ${firstProduct.name} is ${formatCurrency(firstProduct.price)} and ${secondProduct.name} is ${formatCurrency(secondProduct.price)}`,
    `- Stock: ${firstProduct.name} has ${firstProduct.quantity} units and ${secondProduct.name} has ${secondProduct.quantity} units`,
    `- Units sold: ${firstProduct.name} has sold ${firstStats.unitsSold} and ${secondProduct.name} has sold ${secondStats.unitsSold}`,
    `- More affordable option: ${cheaperProduct.name}`,
    `- More stock on hand: ${strongerStock.name}`,
    `- Better sales momentum: ${strongerSales.name}`
  ].join("\n");
}

function buildUnknownProductReply(targets, context) {
  const availableProducts = context.products
    .slice(0, MAX_LIST_ITEMS)
    .map((product) => product.name)
    .join(", ");

  return [
    "I could not confidently identify that product from the current catalog.",
    targets.length ? `- Could not match: ${targets.join(", ")}` : "- Try using the exact product name from inventory.",
    availableProducts
      ? `- Available products include: ${availableProducts}`
      : "- The catalog is currently empty."
  ].join("\n");
}

function buildProductSalesReply(product, context, range) {
  const relevantSales = filterSalesByRange(
    context.sales.filter(
      (sale) =>
        sale.productId === product.id ||
        normalizeForMatch(sale.productName) === product.matchName
    ),
    range
  );

  if (!relevantSales.length) {
    return `${product.name} has no recorded sales${range ? ` for ${range.label}` : ""}.`;
  }

  const totalRevenue = roundCurrency(
    relevantSales.reduce((sum, sale) => sum + toNumber(sale.totalPrice), 0)
  );
  const unitsSold = relevantSales.reduce((sum, sale) => sum + toNumber(sale.quantity), 0);

  return [
    `${product.name} sales performance${range ? ` for ${range.label}` : ""}:`,
    `- Revenue: ${formatCurrency(totalRevenue)}`,
    `- Units sold: ${pluralize(unitsSold, "unit")}`,
    `- Orders: ${pluralize(relevantSales.length, "order")}`,
    `- Last sale: ${formatDate(relevantSales[0].date)}`
  ].join("\n");
}

function buildProductCustomersReply(product, context) {
  const buyerMap = new Map();

  context.sales
    .filter(
      (sale) =>
        sale.productId === product.id ||
        normalizeForMatch(sale.productName) === product.matchName
    )
    .forEach((sale) => {
      const customerName = normalizeText(sale.customerName) || "Walk-in Customer";
      const key = normalizeDigits(sale.mobile) || normalizeForMatch(customerName);
      const current = buyerMap.get(key) || {
        customerName,
        quantity: 0,
        revenue: 0,
        orderCount: 0,
        lastPurchaseAt: null
      };

      current.quantity += toNumber(sale.quantity);
      current.revenue += toNumber(sale.totalPrice);
      current.orderCount += 1;

      if (!current.lastPurchaseAt || new Date(sale.date) > new Date(current.lastPurchaseAt)) {
        current.lastPurchaseAt = sale.date;
      }

      buyerMap.set(key, current);
    });

  const buyers = Array.from(buyerMap.values())
    .map((buyer) => ({
      ...buyer,
      revenue: roundCurrency(buyer.revenue)
    }))
    .sort((left, right) => new Date(right.lastPurchaseAt || 0) - new Date(left.lastPurchaseAt || 0));

  if (!buyers.length) {
    return `${product.name} does not have any recorded buyers yet.`;
  }

  return [
    `Customers who bought ${product.name}:`,
    ...buyers.slice(0, MAX_LIST_ITEMS).map(
      (buyer) =>
        `- ${buyer.customerName}: ${pluralize(buyer.quantity, "unit")} across ${pluralize(buyer.orderCount, "order")} for ${formatCurrency(buyer.revenue)}${buyer.lastPurchaseAt ? `, last bought ${formatDate(buyer.lastPurchaseAt)}` : ""}`
    )
  ].join("\n");
}

function buildCatalogReply(products, title, options = {}) {
  if (!products.length) {
    return "No matching inventory items were found.";
  }

  const limit = options.all ? MAX_DETAILED_LIST_ITEMS : MAX_LIST_ITEMS;
  const shownProducts = products.slice(0, limit);

  return [
    `${title}:`,
    options.all ? `- Showing ${shownProducts.length} of ${pluralize(products.length, "product")}` : null,
    ...shownProducts.map(
      (product) =>
        `- ${product.name}: ${product.quantity} units at ${formatCurrency(product.price)}`
    ),
    products.length > shownProducts.length
      ? `- Plus ${products.length - shownProducts.length} more items`
      : "- End of list"
  ]
    .filter(Boolean)
    .join("\n");
}

function buildTopProductsReply(sales, title) {
  const aggregates = new Map();

  sales.forEach((sale) => {
    const current = aggregates.get(sale.productName) || {
      productName: sale.productName,
      unitsSold: 0,
      revenue: 0
    };

    current.unitsSold += toNumber(sale.quantity);
    current.revenue += toNumber(sale.totalPrice);

    aggregates.set(sale.productName, current);
  });

  const ranked = Array.from(aggregates.values())
    .map((item) => ({
      ...item,
      revenue: roundCurrency(item.revenue)
    }))
    .sort((left, right) => right.unitsSold - left.unitsSold);

  if (!ranked.length) {
    return "No sales data is available for that request yet.";
  }

  return [
    `${title}:`,
    ...ranked.slice(0, MAX_LIST_ITEMS).map(
      (item) =>
        `- ${item.productName}: ${pluralize(item.unitsSold, "unit")} sold for ${formatCurrency(item.revenue)}`
    )
  ].join("\n");
}

function buildSlowMoversReply(context) {
  const ranked = context.products
    .map((product) => ({
      product,
      stats: getProductStats(context, product)
    }))
    .sort((left, right) => left.stats.unitsSold - right.stats.unitsSold);

  if (!ranked.length) {
    return "No inventory products are available yet.";
  }

  return [
    "Slow-moving products:",
    ...ranked.slice(0, MAX_LIST_ITEMS).map(
      ({ product, stats }) =>
        `- ${product.name}: ${stats.unitsSold} units sold, ${product.quantity} units still in stock`
    )
  ].join("\n");
}

function buildCustomerSummaryReply(context) {
  if (!context.topCustomers.length) {
    return "No customer purchase history is available yet.";
  }

  return [
    "Top customers by revenue:",
    ...context.topCustomers.map(
      (customer) =>
        `- ${customer.customerName}: ${formatCurrency(customer.revenue)} across ${customer.orderCount} orders`
    )
  ].join("\n");
}

function buildRecommendationReply(context) {
  if (!context.analytics.recommendedActions.length) {
    return "The store is stable right now. Keep monitoring stock levels and daily sales.";
  }

  return [
    "Recommended next actions:",
    ...context.analytics.recommendedActions.map((action) => `- ${action}`)
  ].join("\n");
}

function buildHelpReply() {
  return [
    `${ASSISTANT_NAME} can answer grounded retail questions such as:`,
    "- Which product is cheapest or most expensive?",
    "- Which items are low on stock or out of stock?",
    "- What is the inventory value, total revenue, or average order value?",
    "- What are the best-selling or slow-moving products?",
    "- Compare two products by price, stock, and sales",
    "- Show latest sales, all customers, top customers, or product-specific performance",
    "- Show what a customer bought by name or mobile number",
    "- Forecast the next 7 days of sales",
    "- Draft customer-service replies for availability, restocks, or follow-ups"
  ].join("\n");
}

function getAssistantPrompts(context) {
  const cheapest = context.availableProducts[0]?.name;
  const highestStock = [...context.products].sort((left, right) => right.quantity - left.quantity)[0]?.name;
  const restockProduct = context.analytics?.productRecommendations?.restockPriorities?.[0]?.name;
  const recentCustomer = context.customerProfiles[0]?.customerName;
  const comparisonTarget =
    context.products.find((product) => product.name !== cheapest)?.name || cheapest;

  return [
    "Which product is the cheapest right now?",
    restockProduct ? `Why should we restock ${restockProduct} first?` : "Which items need restocking first?",
    "How much revenue did we make today?",
    "Show latest sales.",
    "List all customers.",
    recentCustomer ? `What products did ${recentCustomer} buy?` : "Show customer purchase history.",
    "Forecast the next 7 days of sales.",
    highestStock ? `How many units of ${highestStock} are left?` : "Which product has the highest stock?",
    "What customer-service automations are ready right now?",
    cheapest && comparisonTarget
      ? `Compare ${cheapest} with ${comparisonTarget}`
      : "Compare two products for me."
  ];
}

function buildOverviewReply(context) {
  const topProduct = context.analytics.topProducts[0];
  const firstAction = context.analytics.recommendedActions[0];

  return [
    "Current retail overview:",
    `- Revenue: ${formatCurrency(context.analytics.totals.totalRevenue)} from ${context.analytics.totals.totalOrders} orders`,
    `- Inventory value: ${formatCurrency(context.analytics.totals.inventoryValue)}`,
    `- Low-stock items: ${context.analytics.totals.lowStockCount}`,
    topProduct
      ? `- Best seller: ${topProduct.name} with ${topProduct.unitsSold} units sold`
      : "- Best seller: not enough sales history yet",
    firstAction ? `- Priority: ${firstAction}` : "- Priority: keep monitoring catalog performance"
  ].join("\n");
}

function buildForecastReply(context) {
  const forecast = context.analytics.forecast;

  if (!forecast?.next7Days?.length) {
    return "I do not have enough sales history yet to build a forecast.";
  }

  return [
    "Sales forecast for the next 7 days:",
    `- Expected revenue: ${formatCurrency(forecast.summary.expectedRevenue)}`,
    `- Expected orders: ${pluralize(forecast.summary.expectedOrders, "order")}`,
    `- Trend: ${forecast.summary.trendDirection}`,
    `- Confidence: ${forecast.summary.confidenceLabel}`,
    ...forecast.next7Days.slice(0, 4).map(
      (day) =>
        `- ${day.label}: ${formatCurrency(day.projectedRevenue)} across about ${day.projectedOrders} orders`
    )
  ].join("\n");
}

function buildRecommendationSummaryReply(context) {
  const recommendations = context.analytics.productRecommendations;

  return [
    "Recommended merchandising actions:",
    recommendations.featured[0]
      ? `- Promote ${recommendations.featured[0].name}: ${recommendations.featured[0].reason}`
      : "- No immediate promotion candidate stands out yet.",
    recommendations.restockPriorities[0]
      ? `- Restock ${recommendations.restockPriorities[0].name}: ${recommendations.restockPriorities[0].reason}`
      : "- No urgent restock action is required right now.",
    recommendations.slowMovers[0]
      ? `- Support ${recommendations.slowMovers[0].name} with bundling or discounting because ${recommendations.slowMovers[0].reason.toLowerCase()}`
      : "- No slow-moving item needs intervention right now."
  ].join("\n");
}

function buildCustomerServiceReply(context) {
  const templates = context.analytics.customerService?.templates || [];

  if (!templates.length) {
    return "Customer-service automation templates are not available yet.";
  }

  return [
    "Customer-service automation is ready for:",
    ...templates.slice(0, 4).map(
      (template) => `- ${template.title}: ${template.description}`
    )
  ].join("\n");
}

function buildGeminiRetailPayload(context) {
  return {
    generatedAt: new Date().toISOString(),
    dataVersion: context.dataVersion,
    notes: [
      "Products, sales, and customers below are the current live database snapshot.",
      "Sales are sorted newest first.",
      "Customer profiles are aggregated from the sales rows."
    ],
    totals: context.analytics.totals,
    inventoryHealth: context.analytics.inventoryHealth,
    products: context.products.map((product) => ({
      id: product.id,
      name: product.name,
      sku: product.sku,
      category: product.category,
      reorderLevel: product.reorderLevel,
      quantity: product.quantity,
      price: product.price,
      totalValue: product.totalValue,
      status: product.status,
      updatedAt: product.updatedAt
    })),
    sales: context.sales.map((sale) => ({
      id: sale.id,
      customerName: sale.customerName,
      mobile: sale.mobile,
      productId: sale.productId,
      productName: sale.productName,
      quantity: sale.quantity,
      unitPrice: sale.unitPrice,
      totalPrice: sale.totalPrice,
      date: sale.date
    })),
    customers: context.customerProfiles.map((customer) => ({
      customerName: customer.customerName,
      mobiles: customer.mobiles,
      orderCount: customer.orderCount,
      unitsBought: customer.unitsBought,
      revenue: customer.revenue,
      lastPurchaseAt: customer.lastPurchaseAt,
      products: customer.products.map((product) => ({
        productName: product.productName,
        quantity: product.quantity,
        revenue: product.revenue,
        orderCount: product.orderCount,
        lastPurchaseAt: product.lastPurchaseAt
      }))
    })),
    topProducts: context.analytics.topProducts,
    lowStockItems: context.analytics.lowStockItems,
    recommendedActions: context.analytics.recommendedActions,
    forecast: context.analytics.forecast,
    productRecommendations: context.analytics.productRecommendations,
    customerInsights: context.analytics.customerInsights
  };
}

function isGeminiConfigured() {
  return Boolean(GEMINI_API_KEY && !GEMINI_API_KEY.includes("PASTE_YOUR_KEY"));
}

function getGeminiStatus() {
  return {
    configured: isGeminiConfigured(),
    model: GEMINI_MODEL,
    provider: "gemini"
  };
}

async function generateGroundedGeminiReply(message, context, history) {
  if (!isGeminiConfigured()) {
    return null;
  }

  const retailPayload = buildGeminiRetailPayload(context);
  const prompt = `
You are ${ASSISTANT_NAME}.

STRICT RULES:
- You MUST answer only from the current database snapshot in RETAIL_DATA_JSON.
- Do not use general retail knowledge, assumptions, examples, or invented product/customer names.
- If the requested customer, product, sale, date range, or number is not present in RETAIL_DATA_JSON, say exactly that it is not found in the current database.
- If the user asks for latest/recent sales, use the sales order in RETAIL_DATA_JSON because it is newest first.
- If the user asks for all customers/products/sales and the list is present, include the complete list from RETAIL_DATA_JSON.
- Prefer exact numbers from RETAIL_DATA_JSON: quantities, revenue, order counts, stock, mobile numbers, and dates.
- Keep the answer concise with a short heading and bullet points.
- Never call yourself Codex, ChatGPT, GPT, or OpenAI.
- If the user asks your identity, say your name is "${ASSISTANT_NAME}".
- If a calculation is needed, calculate only from RETAIL_DATA_JSON and show the result.

Conversation history:
${history}

RETAIL_DATA_JSON:
${JSON.stringify(retailPayload)}

User question:
${message}
`;

  const response = await axios.post(
    GEMINI_ENDPOINT,
    {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.05,
        maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS
      }
    },
    {
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": GEMINI_API_KEY
      },
      timeout: REQUEST_TIMEOUT_MS
    }
  );

  const reply = response.data?.candidates?.[0]?.content?.parts
    ?.map((part) => part.text || "")
    .join("")
    .trim();

  if (!reply) {
    throw new Error("Empty Gemini response");
  }

  return sanitizeAssistantReply(reply);
}

async function answerRetailQuestion(message, context, history) {
  const normalizedQuery = normalizeForMatch(message);
  const matchedProducts = findMatchedProducts(message, context);
  const firstProduct = matchedProducts[0];
  const secondProduct = matchedProducts[1];
  const comparisonTargets = extractComparisonTargets(message);
  const comparisonMatches = comparisonTargets
    .map((target) => findMatchedProducts(target, context)[0])
    .filter(Boolean);
  const range = getDateRange(message);
  const rangedSales = filterSalesByRange(context.sales, range);
  const locallyMatchedCustomers = findMatchedCustomers(message, context);
  let geminiAttempted = false;

  if (isGeminiConfigured()) {
    geminiAttempted = true;

    try {
      const aiReply = await generateGroundedGeminiReply(message, context, history);

      if (aiReply) {
        return {
          reply: aiReply,
          source: "gemini",
          intent: "grounded-gemini",
          matchedProducts: matchedProducts.slice(0, 4).map((product) => product.name),
          matchedCustomers: locallyMatchedCustomers
            .slice(0, 4)
            .map((customer) => customer.customerName)
        };
      }
    } catch (error) {
      console.warn(`Gemini primary response failed: ${error.message}`);
    }
  }

  if (/^(hi|hello|hey|good morning|good afternoon|good evening)\b/.test(normalizedQuery)) {
    return {
      reply: [
        `Hello, this is the ${ASSISTANT_NAME}.`,
        `- Inventory items: ${context.analytics.totals.totalProducts}`,
        `- Revenue so far: ${formatCurrency(context.analytics.totals.totalRevenue)}`,
        "- Ask about price, stock, sales, comparisons, or recommendations."
      ].join("\n"),
      source: "rules",
      intent: "greeting"
    };
  }

  if (
    hasAny(message, [
      "who are you",
      "what is your name",
      "your name",
      "what are you"
    ])
  ) {
    return {
      reply: [
        `I am the ${ASSISTANT_NAME}.`,
        "- I answer using the current inventory, sales, recommendation, and forecast data.",
        "- I can also help draft customer-service responses grounded in your live store information."
      ].join("\n"),
      source: "rules",
      intent: "identity"
    };
  }

  if (
    hasAny(message, [
      "help",
      "what can you do",
      "how can you help",
      "what can i ask",
      "example questions",
      "capabilities"
    ])
  ) {
    return {
      reply: buildHelpReply(),
      source: "rules",
      intent: "help"
    };
  }

  if (
    hasAny(message, ["compare", "vs", "versus", "difference", "better"])
  ) {
    if (comparisonTargets.length >= 2 && comparisonMatches.length >= 2) {
      return {
        reply: buildComparisonReply(comparisonMatches[0], comparisonMatches[1], context),
        source: "rules",
        intent: "comparison",
        matchedProducts: [comparisonMatches[0].name, comparisonMatches[1].name]
      };
    }

    if (firstProduct && secondProduct) {
      return {
        reply: buildComparisonReply(firstProduct, secondProduct, context),
        source: "rules",
        intent: "comparison",
        matchedProducts: [firstProduct.name, secondProduct.name]
      };
    }

    return {
      reply: buildUnknownProductReply(comparisonTargets, context),
      source: "rules",
      intent: "comparison-not-found"
    };
  }

  if (hasAny(message, ["cheapest", "lowest price", "most affordable"])) {
    const cheapestProduct = context.availableProducts[0];

    if (!cheapestProduct) {
      return {
        reply: "There are no in-stock products available right now.",
        source: "rules",
        intent: "cheapest-product"
      };
    }

    return {
      reply: [
        "Cheapest available product:",
        `- ${cheapestProduct.name} at ${formatCurrency(cheapestProduct.price)}`,
        `- Stock available: ${pluralize(cheapestProduct.quantity, "unit")}`,
        `- Inventory value: ${formatCurrency(cheapestProduct.totalValue)}`
      ].join("\n"),
      source: "rules",
      intent: "cheapest-product",
      matchedProducts: [cheapestProduct.name]
    };
  }

  if (hasAny(message, ["most expensive", "highest price", "costliest", "premium product"])) {
    const mostExpensiveProduct = [...context.availableProducts].sort(
      (left, right) => right.price - left.price
    )[0];

    if (!mostExpensiveProduct) {
      return {
        reply: "There are no in-stock products available right now.",
        source: "rules",
        intent: "most-expensive-product"
      };
    }

    return {
      reply: [
        "Most expensive available product:",
        `- ${mostExpensiveProduct.name} at ${formatCurrency(mostExpensiveProduct.price)}`,
        `- Stock available: ${pluralize(mostExpensiveProduct.quantity, "unit")}`,
        `- Lifetime units sold: ${getProductStats(context, mostExpensiveProduct).unitsSold}`
      ].join("\n"),
      source: "rules",
      intent: "most-expensive-product",
      matchedProducts: [mostExpensiveProduct.name]
    };
  }

  if (hasAny(message, ["highest stock", "most stock", "maximum stock"])) {
    const highestStockProduct = [...context.products].sort(
      (left, right) => right.quantity - left.quantity
    )[0];

    return {
      reply: highestStockProduct
        ? [
            "Highest-stock product:",
            `- ${highestStockProduct.name} with ${pluralize(highestStockProduct.quantity, "unit")}`,
            `- Price: ${formatCurrency(highestStockProduct.price)}`
          ].join("\n")
        : "No products are available in inventory yet.",
      source: "rules",
      intent: "highest-stock-product",
      matchedProducts: highestStockProduct ? [highestStockProduct.name] : []
    };
  }

  if (hasAny(message, ["lowest stock", "least stock"]) && !hasAny(message, ["low stock"])) {
    const lowestStockProduct = [...context.availableProducts].sort(
      (left, right) => left.quantity - right.quantity
    )[0];

    return {
      reply: lowestStockProduct
        ? [
            "Lowest-stock available product:",
            `- ${lowestStockProduct.name} with ${pluralize(lowestStockProduct.quantity, "unit")} left`,
            `- Price: ${formatCurrency(lowestStockProduct.price)}`
          ].join("\n")
        : "No in-stock products are available right now.",
      source: "rules",
      intent: "lowest-stock-product",
      matchedProducts: lowestStockProduct ? [lowestStockProduct.name] : []
    };
  }

  if (hasAny(message, ["low stock", "out of stock", "restock", "reorder", "stock risk"])) {
    const filtered =
      hasAny(message, ["out of stock"])
        ? context.products.filter((product) => product.quantity <= 0)
        : context.analytics.lowStockItems;

    return {
      reply: buildCatalogReply(
        filtered,
        hasAny(message, ["out of stock"]) ? "Out-of-stock items" : "Items that need attention"
      ),
      source: "rules",
      intent: hasAny(message, ["out of stock"]) ? "out-of-stock" : "low-stock"
    };
  }

  if (firstProduct && hasAny(message, ["who bought", "buyers", "customers", "purchased"])) {
    return {
      reply: buildProductCustomersReply(firstProduct, context),
      source: "rules",
      intent: "product-customers",
      matchedProducts: [firstProduct.name]
    };
  }

  if (
    firstProduct &&
    hasAny(message, ["sales", "sold", "revenue", "performance", "orders", "popular"])
  ) {
    return {
      reply: buildProductSalesReply(firstProduct, context, range),
      source: "rules",
      intent: "product-sales",
      matchedProducts: [firstProduct.name]
    };
  }

  if (firstProduct && hasAny(message, ["price", "cost", "rate"])) {
    return {
      reply: buildProductSnapshotReply(firstProduct, context),
      source: "rules",
      intent: "product-price",
      matchedProducts: [firstProduct.name]
    };
  }

  if (firstProduct && hasAny(message, ["stock", "quantity", "available", "left"])) {
    return {
      reply: buildProductSnapshotReply(firstProduct, context),
      source: "rules",
      intent: "product-stock",
      matchedProducts: [firstProduct.name]
    };
  }

  if (firstProduct) {
    return {
      reply: buildProductSnapshotReply(firstProduct, context),
      source: "rules",
      intent: "product-snapshot",
      matchedProducts: [firstProduct.name]
    };
  }

  if (hasAny(message, ["price list", "all prices", "prices of products", "list prices"])) {
    return {
      reply: buildCatalogReply(context.products.sort((left, right) => left.price - right.price), "Product prices"),
      source: "rules",
      intent: "price-list"
    };
  }

  if (isCustomerLookupQuery(message)) {
    const customerMatches = findMatchedCustomers(message, context);
    const customerLookupText = extractCustomerLookupText(message);

    if (customerMatches.length > 1 && tokenize(customerLookupText).length <= 1) {
      return {
        reply: buildAmbiguousCustomerReply(customerMatches),
        source: "rules",
        intent: "customer-ambiguous",
        matchedCustomers: customerMatches.slice(0, MAX_LIST_ITEMS).map((customer) => customer.customerName)
      };
    }

    if (customerMatches[0]) {
      return {
        reply: buildCustomerPurchaseReply(customerMatches[0], range),
        source: "rules",
        intent: "customer-purchases",
        matchedCustomers: [customerMatches[0].customerName]
      };
    }

    if (customerLookupText && hasExplicitCustomerPurchaseCue(message)) {
      return {
        reply: buildUnknownCustomerReply(customerLookupText, context),
        source: "rules",
        intent: "customer-not-found"
      };
    }
  }

  if (isCustomerCountQuery(message)) {
    return {
      reply: buildCustomerCountReply(context),
      source: "rules",
      intent: "customer-count"
    };
  }

  if (isCustomerListQuery(message)) {
    return {
      reply: buildCustomerListReply(context, { all: hasAny(message, ["all", "list", "show"]) }),
      source: "rules",
      intent: "customer-list",
      matchedCustomers: context.customerProfiles
        .slice(0, MAX_DETAILED_LIST_ITEMS)
        .map((customer) => customer.customerName)
    };
  }

  if (isSalesListQuery(message)) {
    return {
      reply: buildSalesListReply(
        rangedSales,
        `${hasAny(message, ["latest", "recent", "last"]) ? "Latest sales" : "Sales history"}${range ? ` for ${range.label}` : ""}`,
        {
          all: hasAny(message, ["all", "list", "history", "show"]),
          rangeLabel: range?.label
        }
      ),
      source: "rules",
      intent: "sales-list"
    };
  }

  if (
    hasAny(message, [
      "what did we sell",
      "what products did we sell",
      "which products did we sell",
      "what items did we sell",
      "products sold",
      "items sold",
      "sold today",
      "sold this week",
      "sold this month"
    ])
  ) {
    return {
      reply: buildTopProductsReply(rangedSales, `Products sold${range ? ` for ${range.label}` : ""}`),
      source: "rules",
      intent: "products-sold"
    };
  }

  if (
    hasAny(message, [
      "total sales",
      "total revenue",
      "revenue",
      "sales today",
      "sales this week",
      "sales this month",
      "orders",
      "average order"
    ])
  ) {
    return {
      reply: buildSalesSummaryReply(rangedSales, range?.label),
      source: "rules",
      intent: "sales-summary"
    };
  }

  if (hasAny(message, ["inventory value", "stock value", "inventory worth"])) {
    return {
      reply: [
        "Inventory valuation:",
        `- Current inventory value: ${formatCurrency(context.analytics.totals.inventoryValue)}`,
        `- Total units in stock: ${pluralize(context.analytics.totals.totalUnits, "unit")}`,
        `- Active products: ${pluralize(context.analytics.totals.totalProducts, "product")}`
      ].join("\n"),
      source: "rules",
      intent: "inventory-value"
    };
  }

  if (hasAny(message, ["forecast", "predict", "projection", "next 7 days", "future sales"])) {
    return {
      reply: buildForecastReply(context),
      source: "rules",
      intent: "forecast"
    };
  }

  if (hasAny(message, ["how many products", "number of products", "product count", "catalog size"])) {
    return {
      reply: [
        "Catalog size:",
        `- Active products: ${pluralize(context.analytics.totals.totalProducts, "product")}`,
        `- In-stock products: ${pluralize(context.availableProducts.length, "product")}`,
        `- Out-of-stock products: ${pluralize(context.analytics.totals.outOfStockCount, "product")}`
      ].join("\n"),
      source: "rules",
      intent: "catalog-size"
    };
  }

  if (hasAny(message, ["best-selling", "top selling", "top-selling", "most sold", "best seller"])) {
    return {
      reply: buildTopProductsReply(rangedSales, `Top-selling products${range ? ` for ${range.label}` : ""}`),
      source: "rules",
      intent: "top-products"
    };
  }

  if (hasAny(message, ["slow moving", "least sold", "worst selling", "low performing"])) {
    return {
      reply: buildSlowMoversReply(context),
      source: "rules",
      intent: "slow-movers"
    };
  }

  if (hasAny(message, ["recent sales", "latest sales", "recent orders", "last orders"])) {
    if (!rangedSales.length) {
      return {
        reply: `No sales were recorded${range ? ` for ${range.label}` : ""}.`,
        source: "rules",
        intent: "recent-sales"
      };
    }

    return {
      reply: [
        `Recent sales${range ? ` for ${range.label}` : ""}:`,
        ...rangedSales.slice(0, MAX_LIST_ITEMS).map(
          (sale) =>
            `- ${sale.customerName} bought ${sale.productName} x${sale.quantity} for ${formatCurrency(sale.totalPrice)} on ${formatDate(sale.date)}`
        )
      ].join("\n"),
      source: "rules",
      intent: "recent-sales"
    };
  }

  if (hasAny(message, ["top customer", "best customer", "customer summary", "top customers"])) {
    return {
      reply: buildCustomerSummaryReply(context),
      source: "rules",
      intent: "top-customers"
    };
  }

  if (hasAny(message, ["available products", "in stock", "available items"])) {
    return {
      reply: buildCatalogReply(context.availableProducts, "In-stock products"),
      source: "rules",
      intent: "available-products"
    };
  }

  if (isCatalogListQuery(message)) {
    return {
      reply: buildCatalogReply(context.products, "Catalog overview", {
        all: hasAny(message, ["all", "list", "show", "full", "complete"])
      }),
      source: "rules",
      intent: "catalog"
    };
  }

  if (hasAny(message, ["products", "catalog", "inventory items", "show inventory"])) {
    return {
      reply: buildCatalogReply(context.products, "Catalog overview"),
      source: "rules",
      intent: "catalog"
    };
  }

  if (hasAny(message, ["recommend", "priority", "what should i do", "improve"])) {
    return {
      reply: `${buildRecommendationReply(context)}\n\n${buildRecommendationSummaryReply(context)}`,
      source: "rules",
      intent: "recommendations"
    };
  }

  if (
    hasAny(message, [
      "customer service",
      "customer support",
      "reply to customer",
      "whatsapp reply",
      "customer message"
    ])
  ) {
    return {
      reply: buildCustomerServiceReply(context),
      source: "rules",
      intent: "customer-service"
    };
  }

  if (!geminiAttempted) {
    try {
      const aiReply = await generateGroundedGeminiReply(message, context, history);

      if (aiReply) {
        return {
          reply: sanitizeAssistantReply(aiReply),
          source: "gemini",
          intent: "grounded-fallback"
        };
      }
    } catch (error) {
      console.warn(`Gemini fallback failed: ${error.message}`);
    }
  }

  return {
    reply: `${buildHelpReply()}\n\n${buildOverviewReply(context)}`,
    source: "summary",
    intent: "fallback-summary"
  };
}

module.exports = {
  ASSISTANT_CAPABILITIES,
  answerRetailQuestion,
  buildAssistantContext,
  getAssistantPrompts,
  getGeminiStatus,
  isGeminiConfigured
};
