const express = require("express");

const asyncHandler = require("../lib/asyncHandler");
const {
  ASSISTANT_CAPABILITIES,
  answerRetailQuestion,
  buildAssistantContext,
  getAssistantPrompts,
  getGeminiStatus
} = require("../lib/assistantEngine");
const { createHttpError } = require("../lib/errors");
const { normalizeText } = require("../lib/validators");
const { listSales } = require("../services/salesService");
const { listProducts } = require("../services/storeService");

const router = express.Router();

const CHAT_HISTORY_LIMIT = 8;
const CACHE_LIMIT = 60;

const cache = new Map();
const chatHistoryByUser = new Map();

function setCache(key, value) {
  if (!key) return;

  if (cache.has(key)) {
    cache.delete(key);
  }

  cache.set(key, value);

  if (cache.size > CACHE_LIMIT) {
    const oldestKey = cache.keys().next().value;
    cache.delete(oldestKey);
  }
}

function getUserHistory(ownerId) {
  if (!chatHistoryByUser.has(ownerId)) {
    chatHistoryByUser.set(ownerId, []);
  }

  return chatHistoryByUser.get(ownerId);
}

function pushChatMessage(ownerId, role, content) {
  if (!content) return;

  const chatHistory = getUserHistory(ownerId);
  chatHistory.push({ role, content });

  while (chatHistory.length > CHAT_HISTORY_LIMIT) {
    chatHistory.shift();
  }
}

async function getRetailContext(user) {
  const owner = {
    ownerId: user.sub,
    ownerEmail: user.email
  };
  const [products, sales] = await Promise.all([listProducts(owner), listSales(owner)]);
  return buildAssistantContext(products, sales);
}

router.get(
  "/suggestions",
  asyncHandler(async (req, res) => {
    const context = await getRetailContext(req.user);

    res.json({
      prompts: getAssistantPrompts(context),
      capabilities: ASSISTANT_CAPABILITIES
    });
  })
);

router.post(
  "/chat",
  asyncHandler(async (req, res) => {
    const rawMessage = normalizeText(req.body?.message);

    if (!rawMessage) {
      throw createHttpError(400, "Message is required.");
    }

    const context = await getRetailContext(req.user);
    const geminiStatus = getGeminiStatus();
    const engineVersion = geminiStatus.configured
      ? `gemini:${geminiStatus.model}`
      : "rules";
    const cacheKey = `${engineVersion}::${rawMessage.toLowerCase()}::${context.dataVersion || "live"}`;
    const sharedPayload = {
      suggestedPrompts: getAssistantPrompts(context),
      capabilities: ASSISTANT_CAPABILITIES,
      ai: geminiStatus
    };

    if (cache.has(cacheKey)) {
      const cached = cache.get(cacheKey);

      return res.json({
        ...cached,
        source: cached.source === "gemini" ? "gemini-cache" : "cache",
        ...sharedPayload
      });
    }

    pushChatMessage(req.user.sub, "user", rawMessage);

    const historyText = getUserHistory(req.user.sub)
      .map((item) => `${item.role}: ${item.content}`)
      .join("\n");

    const result = await answerRetailQuestion(rawMessage, context, historyText);

    pushChatMessage(req.user.sub, "assistant", result.reply);
    setCache(cacheKey, {
      reply: result.reply,
      source: result.source,
      intent: result.intent,
      matchedProducts: result.matchedProducts || [],
      matchedCustomers: result.matchedCustomers || [],
      generatedAt: new Date().toISOString()
    });

    res.json({
      reply: result.reply,
      source: result.source,
      intent: result.intent,
      matchedProducts: result.matchedProducts || [],
      matchedCustomers: result.matchedCustomers || [],
      generatedAt: new Date().toISOString(),
      ...sharedPayload
    });
  })
);

module.exports = router;
