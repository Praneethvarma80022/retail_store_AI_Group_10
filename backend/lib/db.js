const mongoose = require("mongoose");

let storageMode = "file";

mongoose.connection.on("disconnected", () => {
  storageMode = "file";
});

mongoose.connection.on("error", (error) => {
  console.warn(`MongoDB error: ${error.message}`);
  storageMode = "file";
});

async function connectToDatabase() {
  const mongoUri = process.env.MONGO_URI;

  if (!mongoUri) {
    console.warn("MONGO_URI is not configured. Using local file storage.");
    return {
      mode: storageMode,
      ready: false
    };
  }

  try {
    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 30000,
      socketTimeoutMS: 30000,
      maxPoolSize: 10,
      minPoolSize: 2,
      retryWrites: true,
      w: 'majority'
    });

    storageMode = "mongo";
    console.log("MongoDB connected.");

    return {
      mode: storageMode,
      ready: true
    };
  } catch (error) {
    storageMode = "file";
    console.warn(`MongoDB unavailable (${error.message}). Using local file storage.`);

    return {
      mode: storageMode,
      ready: false
    };
  }
}

function isMongoConfigured() {
  return Boolean(process.env.MONGO_URI);
}

function isMongoReady() {
  return storageMode === "mongo" && mongoose.connection.readyState === 1;
}

function getStorageMode() {
  return isMongoReady() ? "mongo" : "file";
}

module.exports = {
  connectToDatabase,
  getStorageMode,
  isMongoConfigured,
  isMongoReady
};
