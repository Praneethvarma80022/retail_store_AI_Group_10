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
const {
  appendChatMessages,
  clearChatMessages,
  listChatMessages
} = require("../services/chatHistoryService");
const { listSales } = require("../services/salesService");
const { listProducts } = require("../services/storeService");

const router = express.Router();

const CHAT_HISTORY_LIMIT = 8;
const CACHE_LIMIT = 60;

const cache = new Map();

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

function buildHistoryText(messages) {
  return messages.map((item) => `${item.role}: ${item.content}`).join("\n");
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

router.get(
  "/history",
  asyncHandler(async (req, res) => {
    const history = await listChatMessages({
      ownerId: req.user.sub,
      ownerEmail: req.user.email,
      limit: 24
    });

    res.json({
      messages: history
    });
  })
);

router.delete(
  "/history",
  asyncHandler(async (req, res) => {
    const deletedCount = await clearChatMessages({
      ownerId: req.user.sub,
      ownerEmail: req.user.email
    });

    for (const key of cache.keys()) {
      if (String(key).startsWith(`${req.user.sub}::`)) {
        cache.delete(key);
      }
    }

    res.json({
      deletedCount
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
    const historyMessages = await listChatMessages({
      ownerId: req.user.sub,
      ownerEmail: req.user.email,
      limit: CHAT_HISTORY_LIMIT
    });
    const historyText = buildHistoryText(historyMessages);
    const historySignature = historyMessages
      .map((item) => `${item.role}:${item.content}`)
      .join("|")
      .slice(-400);
    const engineVersion = geminiStatus.configured
      ? `gemini:${geminiStatus.model}`
      : "rules";
    const cacheKey = `${req.user.sub}::${engineVersion}::${rawMessage.toLowerCase()}::${context.dataVersion || "live"}::${historySignature}`;
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

    const result = await answerRetailQuestion(rawMessage, context, historyText);

    const generatedAt = new Date().toISOString();
    await appendChatMessages(
      [
        {
          role: "user",
          content: rawMessage
        },
        {
          role: "assistant",
          content: result.reply,
          source: result.source,
          intent: result.intent,
          matchedProducts: result.matchedProducts || [],
          matchedCustomers: result.matchedCustomers || []
        }
      ],
      {
        ownerId: req.user.sub,
        ownerEmail: req.user.email
      }
    );

    setCache(cacheKey, {
      reply: result.reply,
      source: result.source,
      intent: result.intent,
      matchedProducts: result.matchedProducts || [],
      matchedCustomers: result.matchedCustomers || [],
      generatedAt
    });

    res.json({
      reply: result.reply,
      source: result.source,
      intent: result.intent,
      matchedProducts: result.matchedProducts || [],
      matchedCustomers: result.matchedCustomers || [],
      generatedAt,
      ...sharedPayload
    });
  })
);

module.exports = router;
