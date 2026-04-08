function daysAgo(days) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function createDefaultData() {
  return {
    userProfiles: [],
    chatMessages: [],
    products: [
      {
        id: "product-1",
        name: "Wireless Charger",
        normalizedName: "wireless charger",
        sku: "WIRELESS-CHARGER",
        category: "Power",
        reorderLevel: 6,
        quantity: 14,
        price: 1499,
        totalPrice: 20986,
        createdAt: daysAgo(21),
        updatedAt: daysAgo(1)
      },
      {
        id: "product-2",
        name: "USB-C Cable",
        normalizedName: "usb-c cable",
        sku: "USB-C-CABLE",
        category: "Power",
        reorderLevel: 8,
        quantity: 33,
        price: 399,
        totalPrice: 13167,
        createdAt: daysAgo(18),
        updatedAt: daysAgo(0.5)
      },
      {
        id: "product-3",
        name: "Bluetooth Earbuds",
        normalizedName: "bluetooth earbuds",
        sku: "BLUETOOTH-EARBUDS",
        category: "Audio",
        reorderLevel: 4,
        quantity: 8,
        price: 2199,
        totalPrice: 17592,
        createdAt: daysAgo(14),
        updatedAt: daysAgo(2)
      },
      {
        id: "product-4",
        name: "Phone Case",
        normalizedName: "phone case",
        sku: "PHONE-CASE",
        category: "Protection",
        reorderLevel: 10,
        quantity: 28,
        price: 599,
        totalPrice: 16772,
        createdAt: daysAgo(20),
        updatedAt: daysAgo(3)
      },
      {
        id: "product-5",
        name: "Screen Protector",
        normalizedName: "screen protector",
        sku: "SCREEN-PROTECTOR",
        category: "Protection",
        reorderLevel: 6,
        quantity: 5,
        price: 299,
        totalPrice: 1495,
        createdAt: daysAgo(11),
        updatedAt: daysAgo(1)
      },
      {
        id: "product-6",
        name: "Power Bank",
        normalizedName: "power bank",
        sku: "POWER-BANK",
        category: "Power",
        reorderLevel: 5,
        quantity: 3,
        price: 1799,
        totalPrice: 5397,
        createdAt: daysAgo(10),
        updatedAt: daysAgo(0.75)
      }
    ],
    sales: [
      {
        id: "sale-1",
        customerName: "Aarav Singh",
        mobile: "9876543210",
        productId: "product-2",
        productName: "USB-C Cable",
        quantity: 2,
        unitPrice: 399,
        totalPrice: 798,
        date: daysAgo(0.15),
        createdAt: daysAgo(0.15),
        updatedAt: daysAgo(0.15)
      },
      {
        id: "sale-2",
        customerName: "Maya Patel",
        mobile: "9988776655",
        productId: "product-6",
        productName: "Power Bank",
        quantity: 1,
        unitPrice: 1799,
        totalPrice: 1799,
        date: daysAgo(0.7),
        createdAt: daysAgo(0.7),
        updatedAt: daysAgo(0.7)
      },
      {
        id: "sale-3",
        customerName: "Rahul Verma",
        mobile: "9123456780",
        productId: "product-3",
        productName: "Bluetooth Earbuds",
        quantity: 1,
        unitPrice: 2199,
        totalPrice: 2199,
        date: daysAgo(1.2),
        createdAt: daysAgo(1.2),
        updatedAt: daysAgo(1.2)
      },
      {
        id: "sale-4",
        customerName: "Nisha Kapoor",
        mobile: "9000011111",
        productId: "product-4",
        productName: "Phone Case",
        quantity: 3,
        unitPrice: 599,
        totalPrice: 1797,
        date: daysAgo(2.4),
        createdAt: daysAgo(2.4),
        updatedAt: daysAgo(2.4)
      },
      {
        id: "sale-5",
        customerName: "Kabir Khan",
        mobile: "9012345678",
        productId: "product-1",
        productName: "Wireless Charger",
        quantity: 2,
        unitPrice: 1499,
        totalPrice: 2998,
        date: daysAgo(4.1),
        createdAt: daysAgo(4.1),
        updatedAt: daysAgo(4.1)
      }
    ]
  };
}

module.exports = {
  createDefaultData
};
