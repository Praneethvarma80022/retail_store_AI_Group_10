const mongoose = require("mongoose");
require("dotenv").config();

async function fixIndexes() {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 5000
    });

    console.log("Connected to MongoDB");

    // Get the UserProfile collection
    const collection = mongoose.connection.collection("userprofiles");

    // Drop the old unique index on googleId
    try {
      await collection.dropIndex("googleId_1");
      console.log("✓ Dropped old googleId_1 index");
    } catch (err) {
      if (err.message.includes("index not found")) {
        console.log("Index not found, skipping drop");
      } else {
        throw err;
      }
    }

    // Create a new sparse unique index on googleId
    await collection.createIndex({ googleId: 1 }, { sparse: true, unique: true });
    console.log("✓ Created new sparse unique index on googleId");

    // Ensure email has a unique index
    await collection.createIndex({ email: 1 }, { unique: true });
    console.log("✓ Ensured unique index on email");

    console.log("\n✓ Index fixes completed successfully!");

    await mongoose.disconnect();
  } catch (error) {
    console.error("Error fixing indexes:", error);
    process.exit(1);
  }
}

fixIndexes();
