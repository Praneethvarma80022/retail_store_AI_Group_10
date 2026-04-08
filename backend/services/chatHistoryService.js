const ChatMessage = require("../models/ChatMessage");

const { isMongoReady } = require("../lib/db");
const { createHttpError } = require("../lib/errors");
const { normalizeText } = require("../lib/validators");
const { createId, readLocalStore, writeLocalStore } = require("./fileStore");

function requireOwner(options = {}) {
  if (!options.ownerId) {
    throw createHttpError(401, "Sign in is required.");
  }

  return {
    ownerId: String(options.ownerId),
    ownerEmail: normalizeText(options.ownerEmail)
  };
}

function normalizeChatMessage(message = {}) {
  return {
    id: String(message.id || message._id || ""),
    role: normalizeText(message.role) || "assistant",
    content: normalizeText(message.content),
    source: normalizeText(message.source),
    intent: normalizeText(message.intent),
    matchedProducts: Array.isArray(message.matchedProducts) ? message.matchedProducts : [],
    matchedCustomers: Array.isArray(message.matchedCustomers) ? message.matchedCustomers : [],
    timestamp: message.createdAt || message.timestamp || new Date().toISOString()
  };
}

async function listChatMessages(options = {}) {
  const owner = requireOwner(options);
  const limit = Math.max(1, Number(options.limit) || 20);

  if (isMongoReady()) {
    const items = await ChatMessage.find({ ownerId: owner.ownerId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    return items.reverse().map(normalizeChatMessage);
  }

  const data = await readLocalStore();
  return data.chatMessages
    .filter((message) => String(message.ownerId || "") === owner.ownerId)
    .sort((left, right) => new Date(left.createdAt || 0) - new Date(right.createdAt || 0))
    .slice(-limit)
    .map(normalizeChatMessage);
}

async function appendChatMessages(messages, options = {}) {
  const owner = requireOwner(options);
  const records = Array.isArray(messages) ? messages : [];
  const validRecords = records
    .map((message) => ({
      role: normalizeText(message.role).toLowerCase() === "user" ? "user" : "assistant",
      content: normalizeText(message.content),
      source: normalizeText(message.source),
      intent: normalizeText(message.intent),
      matchedProducts: Array.isArray(message.matchedProducts) ? message.matchedProducts : [],
      matchedCustomers: Array.isArray(message.matchedCustomers) ? message.matchedCustomers : []
    }))
    .filter((message) => message.content);

  if (!validRecords.length) {
    return [];
  }

  if (isMongoReady()) {
    const created = await ChatMessage.insertMany(
      validRecords.map((message) => ({
        ownerId: owner.ownerId,
        ownerEmail: owner.ownerEmail,
        ...message
      }))
    );

    return created.map((message) => normalizeChatMessage(message.toObject()));
  }

  const timestamp = new Date().toISOString();
  const data = await readLocalStore();
  const created = validRecords.map((message, index) => ({
    id: createId("chat"),
    ownerId: owner.ownerId,
    ownerEmail: owner.ownerEmail,
    ...message,
    createdAt: new Date(Date.now() + index).toISOString() || timestamp,
    updatedAt: new Date(Date.now() + index).toISOString() || timestamp
  }));

  data.chatMessages.push(...created);
  await writeLocalStore(data);

  return created.map(normalizeChatMessage);
}

async function clearChatMessages(options = {}) {
  const owner = requireOwner(options);

  if (isMongoReady()) {
    const result = await ChatMessage.deleteMany({ ownerId: owner.ownerId });
    return result.deletedCount || 0;
  }

  const data = await readLocalStore();
  const retained = data.chatMessages.filter(
    (message) => String(message.ownerId || "") !== owner.ownerId
  );
  const deletedCount = data.chatMessages.length - retained.length;
  data.chatMessages = retained;
  await writeLocalStore(data);
  return deletedCount;
}

module.exports = {
  appendChatMessages,
  clearChatMessages,
  listChatMessages,
  normalizeChatMessage
};
