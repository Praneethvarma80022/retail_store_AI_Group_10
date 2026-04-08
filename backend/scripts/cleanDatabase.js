const mongoose = require("mongoose");
require("dotenv").config();

async function cleanDatabase() {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 5000
    });

    console.log("Connected to MongoDB");

    // Drop the entire userprofiles collection
    try {
      await mongoose.connection.collection("userprofiles").drop();
      console.log("✓ Dropped userprofiles collection");
    } catch (err) {
      if (err.message.includes("ns not found")) {
        console.log("Collection doesn't exist, continuing");
      } else {
        throw err;
      }
    }

    // Drop the index
    try {
      await mongoose.connection.collection("userprofiles").dropIndex("googleId_1");
      console.log("✓ Dropped googleId_1 index");
    } catch (err) {
      // Index might not exist
    }

    console.log("\n✓ Database cleaned successfully!");

    await mongoose.disconnect();
  } catch (error) {
    console.error("Error cleaning database:", error);
    process.exit(1);
  }
}

cleanDatabase();
