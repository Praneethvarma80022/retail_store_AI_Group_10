const express = require("express");

const { getStorageMode, isMongoConfigured, isMongoReady } = require("../lib/db");
const { getGeminiStatus } = require("../lib/assistantEngine");

const router = express.Router();

router.get("/", (req, res) => {
  const geminiStatus = getGeminiStatus();

  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    storageMode: getStorageMode(),
    databaseConfigured: isMongoConfigured(),
    databaseConnected: isMongoReady(),
    aiConfigured: geminiStatus.configured,
    aiProvider: geminiStatus.provider,
    aiModel: geminiStatus.model
  });
});

module.exports = router;
