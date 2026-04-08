const UserProfile = require("../models/UserProfile");

const { isMongoReady } = require("../lib/db");
const { normalizeText } = require("../lib/validators");
const { createId, readLocalStore, writeLocalStore } = require("./fileStore");

function buildWorkspaceName(name) {
  const normalizedName = normalizeText(name);
  const firstName = normalizedName.split(/\s+/)[0] || "Retail";
  return `${firstName}'s Workspace`;
}

function normalizeUserProfile(profile = {}) {
  return {
    id: String(profile.googleId || profile.id || ""),
    email: normalizeText(profile.email),
    name: normalizeText(profile.name),
    picture: normalizeText(profile.picture),
    role: normalizeText(profile.role).toLowerCase() === "member" ? "member" : "admin",
    workspaceName: normalizeText(profile.workspaceName) || buildWorkspaceName(profile.name)
  };
}

async function provisionUserProfile(user) {
  const workspaceName = buildWorkspaceName(user.name);

  if (isMongoReady()) {
    const existing = await UserProfile.findOne({ googleId: user.id });

    if (existing) {
      existing.email = user.email;
      existing.name = user.name;
      existing.picture = user.picture || "";
      existing.workspaceName = existing.workspaceName || workspaceName;
      await existing.save();
      return normalizeUserProfile(existing.toObject());
    }

    const created = await UserProfile.create({
      googleId: user.id,
      email: user.email,
      name: user.name,
      picture: user.picture || "",
      role: "admin",
      workspaceName
    });

    return normalizeUserProfile(created.toObject());
  }

  const data = await readLocalStore();
  const existing = data.userProfiles.find(
    (profile) => String(profile.googleId || profile.id) === String(user.id)
  );

  if (existing) {
    existing.email = user.email;
    existing.name = user.name;
    existing.picture = user.picture || "";
    existing.workspaceName = existing.workspaceName || workspaceName;
    existing.role = existing.role || "admin";
    existing.updatedAt = new Date().toISOString();
    await writeLocalStore(data);
    return normalizeUserProfile(existing);
  }

  const timestamp = new Date().toISOString();
  const profile = {
    id: createId("profile"),
    googleId: user.id,
    email: user.email,
    name: user.name,
    picture: user.picture || "",
    role: "admin",
    workspaceName,
    createdAt: timestamp,
    updatedAt: timestamp
  };

  data.userProfiles.unshift(profile);
  await writeLocalStore(data);

  return normalizeUserProfile(profile);
}

module.exports = {
  normalizeUserProfile,
  provisionUserProfile
};
