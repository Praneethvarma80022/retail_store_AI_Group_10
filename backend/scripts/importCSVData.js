const fs = require("fs");
const path = require("path");
const csv = require("csv-parser");

// Read existing retail data
const retailDataPath = path.join(__dirname, "../data/retail-data.json");
const retailData = JSON.parse(fs.readFileSync(retailDataPath, "utf-8"));

// Create products if they don't exist
function ensureProducts() {
  const existingIds = new Set(retailData.products.map((p) => p.id));

  // Add Beauty products
  if (!existingIds.has("product-beauty-1")) {
    retailData.products.push(
      {
        id: "product-beauty-1",
        name: "Skincare Set",
        normalizedName: "skincare set",
        sku: "SKINCARE-SET",
        category: "Beauty",
        reorderLevel: 8,
        quantity: 25,
        price: 1200,
        totalPrice: 30000,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: "product-beauty-2",
        name: "Makeup Kit",
        normalizedName: "makeup kit",
        sku: "MAKEUP-KIT",
        category: "Beauty",
        reorderLevel: 6,
        quantity: 18,
        price: 1500,
        totalPrice: 27000,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: "product-beauty-3",
        name: "Hair Treatment",
        normalizedName: "hair treatment",
        sku: "HAIR-TREATMENT",
        category: "Beauty",
        reorderLevel: 7,
        quantity: 22,
        price: 800,
        totalPrice: 17600,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
    );
  }

  // Add Clothing products
  if (!existingIds.has("product-clothing-1")) {
    retailData.products.push(
      {
        id: "product-clothing-1",
        name: "Casual T-Shirt",
        normalizedName: "casual t-shirt",
        sku: "TSHIRT-CASUAL",
        category: "Clothing",
        reorderLevel: 10,
        quantity: 40,
        price: 500,
        totalPrice: 20000,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: "product-clothing-2",
        name: "Formal Shirt",
        normalizedName: "formal shirt",
        sku: "SHIRT-FORMAL",
        category: "Clothing",
        reorderLevel: 8,
        quantity: 30,
        price: 1200,
        totalPrice: 36000,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: "product-clothing-3",
        name: "Denim Jeans",
        normalizedName: "denim jeans",
        sku: "JEANS-DENIM",
        category: "Clothing",
        reorderLevel: 7,
        quantity: 25,
        price: 1800,
        totalPrice: 45000,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
    );
  }
}

// Category mapping to product mapping
const categoryProductMap = {
  Beauty: ["product-beauty-1", "product-beauty-2", "product-beauty-3"],
  Clothing: ["product-clothing-1", "product-clothing-2", "product-clothing-3"],
  Electronics: [
    "product-1",
    "product-2",
    "product-3",
    "product-10",
    "product-11",
    "product-12",
  ],
};

// Ensure products exist first
ensureProducts();

// Process CSV data
let salesCount = 0;
let customerMap = new Map();
let categoryStats = { Beauty: 0, Clothing: 0, Electronics: 0 };

const csvPath = path.join(
  __dirname,
  "../../dataset/retail_sales_dataset.csv"
);

console.log("📂 Reading CSV file:", csvPath);

return new Promise((resolve) => {
  fs.createReadStream(csvPath)
    .pipe(csv())
    .on("data", (row) => {
      try {
        const transactionId = `csv-sale-${row["Transaction ID"]}`;
        const date = new Date(row.Date);
        const customerId = row["Customer ID"];
        const category = row["Product Category"];

        // Skip if sale already exists
        if (retailData.sales.some((s) => s.id === transactionId)) {
          return;
        }

        // Track customer data
        if (!customerMap.has(customerId)) {
          customerMap.set(customerId, {
            id: customerId,
            gender: row.Gender,
            age: parseInt(row.Age),
            purchases: [],
            totalSpent: 0,
          });
        }

        const customer = customerMap.get(customerId);
        const totalAmount = parseFloat(row["Total Amount"]);
        customer.totalSpent += totalAmount;

        // Get a product for this category
        const categoryProducts = categoryProductMap[category] || [];
        const productId =
          categoryProducts[
            Math.floor(Math.random() * categoryProducts.length)
          ] || "product-1";
        const product = retailData.products.find((p) => p.id === productId);

        if (!product) {
          console.warn(`Product not found for category: ${category}`);
          return;
        }

        // Create sale record
        const sale = {
          id: transactionId,
          customerName: `${customerId}_Customer`,
          mobile: `98${String(Math.random()).substring(2, 10)}`,
          productId: productId,
          productName: product.name,
          quantity: parseInt(row.Quantity),
          unitPrice: parseFloat(row["Price per Unit"]),
          totalPrice: totalAmount,
          date: date.toISOString(),
          createdAt: date.toISOString(),
          updatedAt: date.toISOString(),
        };

        retailData.sales.push(sale);
        salesCount++;
        categoryStats[category]++;
        customer.purchases.push({
          productId: productId,
          productName: product.name,
          date: date.toISOString(),
          amount: totalAmount,
        });
      } catch (error) {
        console.error("Error processing row:", error.message);
      }
    })
    .on("end", () => {
      console.log(`✓ Processed ${salesCount} CSV sales records`);

      // Create enhanced customer insights
      const topCustomers = Array.from(customerMap.values())
        .sort((a, b) => b.totalSpent - a.totalSpent)
        .slice(0, 20)
        .map((c) => ({
          id: c.id,
          name: `Customer ${c.id}`,
          mobile: `98${String(Math.random()).substring(2, 10)}`,
          gender: c.gender,
          age: c.age,
          totalSpent: Math.round(c.totalSpent),
          purchases: c.purchases.length,
          lastPurchase: c.purchases[c.purchases.length - 1].date,
          preferences: Array.from(
            new Set(c.purchases.map((p) => p.productName))
          ).slice(0, 3),
        }));

      // Update customer insights
      retailData.customerInsights.topCustomers = topCustomers;
      retailData.customerInsights.totalCustomers = customerMap.size;
      retailData.customerInsights.newCustomersThisMonth = Math.floor(
        customerMap.size * 0.15
      );
      retailData.customerInsights.repeatingCustomers = Math.floor(
        customerMap.size * 0.4
      );

      // Update dashboard metrics with CSV data
      const totalCSVSales = retailData.sales
        .filter((s) => s.id.startsWith("csv-sale-"))
        .reduce((sum, s) => sum + s.totalPrice, 0);
      retailData.dashboardMetrics.totalSales += totalCSVSales;
      retailData.dashboardMetrics.totalTransactions = retailData.sales.length;

      // Update analytics
      Object.entries(categoryStats).forEach(([category, count]) => {
        const existing = retailData.analyticsCharts.categoryDistribution.find(
          (c) => c.category === category
        );
        if (existing) {
          existing.value = Math.round((count / salesCount) * 100);
        } else {
          retailData.analyticsCharts.categoryDistribution.push({
            category,
            value: Math.round((count / salesCount) * 100),
          });
        }
      });

      // Write updated data back
      fs.writeFileSync(retailDataPath, JSON.stringify(retailData, null, 2));

      console.log("✅ CSV data successfully integrated!");
      console.log(`📊 Statistics:`);
      console.log(`  - Total sales added: ${salesCount}`);
      console.log(`  - Unique customers: ${customerMap.size}`);
      console.log(
        `  - Total sales value: ₹${totalCSVSales.toLocaleString("en-IN")}`
      );
      console.log(`  - Category breakdown:`, categoryStats);
      console.log(`  - Retail data updated: ${retailDataPath}`);

      resolve();
    });
}).catch((err) => {
  console.error("Error reading CSV:", err);
});
