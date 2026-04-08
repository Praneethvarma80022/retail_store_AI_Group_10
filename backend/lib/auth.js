const crypto = require("crypto");
const bcrypt = require("bcrypt");
const speakeasy = require("speakeasy");
const QRCode = require("qrcode");

const { createHttpError } = require("./errors");

const GOOGLE_ISSUERS = new Set(["https://accounts.google.com", "accounts.google.com"]);
const GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

let jwksCache = {
  expiresAt: 0,
  keys: []
};

function base64UrlEncode(value) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function base64UrlJson(value) {
  return base64UrlEncode(JSON.stringify(value));
}

function base64UrlDecode(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return Buffer.from(padded, "base64");
}

function parseJwt(token) {
  const [headerPart, payloadPart, signaturePart] = String(token || "").split(".");

  if (!headerPart || !payloadPart || !signaturePart) {
    throw createHttpError(401, "Invalid authentication token.");
  }

  return {
    header: JSON.parse(base64UrlDecode(headerPart).toString("utf8")),
    payload: JSON.parse(base64UrlDecode(payloadPart).toString("utf8")),
    signedContent: `${headerPart}.${payloadPart}`,
    signature: signaturePart
  };
}

function getSessionSecret() {
  return (
    process.env.AUTH_SESSION_SECRET ||
    process.env.SESSION_SECRET ||
    process.env.JWT_SESSION_SECRET ||
    "development-session-secret-change-me"
  );
}

function signSession(payload) {
  const header = {
    alg: "HS256",
    typ: "JWT"
  };
  const now = Math.floor(Date.now() / 1000);
  const sessionPayload = {
    ...payload,
    iat: now,
    exp: now + SESSION_TTL_SECONDS
  };
  const signedContent = `${base64UrlJson(header)}.${base64UrlJson(sessionPayload)}`;
  const signature = crypto
    .createHmac("sha256", getSessionSecret())
    .update(signedContent)
    .digest("base64url");

  return `${signedContent}.${signature}`;
}

function verifySession(token) {
  const parsed = parseJwt(token);
  const expectedSignature = crypto
    .createHmac("sha256", getSessionSecret())
    .update(parsed.signedContent)
    .digest("base64url");

  if (
    !crypto.timingSafeEqual(
      Buffer.from(parsed.signature),
      Buffer.from(expectedSignature)
    )
  ) {
    throw createHttpError(401, "Session is invalid. Please sign in again.");
  }

  if (!parsed.payload?.sub || parsed.payload.exp < Math.floor(Date.now() / 1000)) {
    throw createHttpError(401, "Session expired. Please sign in again.");
  }

  return parsed.payload;
}

async function getGoogleJwks() {
  if (jwksCache.expiresAt > Date.now() && jwksCache.keys.length) {
    return jwksCache.keys;
  }

  const response = await fetch(GOOGLE_JWKS_URL);

  if (!response.ok) {
    throw createHttpError(502, "Unable to verify Google sign-in right now.");
  }

  const cacheControl = response.headers.get("cache-control") || "";
  const maxAgeMatch = cacheControl.match(/max-age=(\d+)/i);
  const maxAgeSeconds = maxAgeMatch ? Number(maxAgeMatch[1]) : 3600;
  const body = await response.json();

  jwksCache = {
    expiresAt: Date.now() + maxAgeSeconds * 1000,
    keys: Array.isArray(body.keys) ? body.keys : []
  };

  return jwksCache.keys;
}

async function verifyGoogleCredential(credential) {
  const clientId = process.env.GOOGLE_CLIENT_ID;

  if (!clientId) {
    throw createHttpError(500, "GOOGLE_CLIENT_ID is not configured on the backend.");
  }

  const parsed = parseJwt(credential);
  const keys = await getGoogleJwks();
  const key = keys.find((item) => item.kid === parsed.header.kid);

  if (!key) {
    jwksCache = { expiresAt: 0, keys: [] };
    throw createHttpError(401, "Google sign-in could not be verified.");
  }

  const publicKey = crypto.createPublicKey({
    key,
    format: "jwk"
  });
  const verified = crypto.verify(
    "RSA-SHA256",
    Buffer.from(parsed.signedContent),
    publicKey,
    base64UrlDecode(parsed.signature)
  );

  if (!verified) {
    throw createHttpError(401, "Google sign-in signature is invalid.");
  }

  const payload = parsed.payload;

  if (!GOOGLE_ISSUERS.has(payload.iss)) {
    throw createHttpError(401, "Google sign-in issuer is invalid.");
  }

  if (payload.aud !== clientId) {
    throw createHttpError(401, "Google sign-in audience is invalid.");
  }

  if (payload.exp < Math.floor(Date.now() / 1000)) {
    throw createHttpError(401, "Google sign-in token expired.");
  }

  if (!payload.sub || !payload.email) {
    throw createHttpError(401, "Google sign-in profile is incomplete.");
  }

  return {
    id: payload.sub,
    email: payload.email,
    name: payload.name || payload.email,
    picture: payload.picture || ""
  };
}

function getAuthenticatedUser(req) {
  const authHeader = req.get("authorization") || "";
  const [, token] = authHeader.match(/^Bearer\s+(.+)$/i) || [];

  if (!token) {
    throw createHttpError(401, "Sign in is required.");
  }

  return verifySession(token);
}

function requireAuth(req, res, next) {
  try {
    req.user = getAuthenticatedUser(req);
    next();
  } catch (error) {
    next(error);
  }
}

function createUserSession(user) {
  const sessionUser = {
    sub: user.id,
    email: user.email,
    name: user.name,
    picture: user.picture,
    role: user.role || "admin",
    workspaceName: user.workspaceName || ""
  };

  return {
    token: signSession(sessionUser),
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      picture: user.picture,
      role: user.role || "admin",
      workspaceName: user.workspaceName || ""
    }
  };
}

// Password authentication functions
async function hashPassword(password) {
  const saltRounds = 10;
  return bcrypt.hash(password, saltRounds);
}

async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

// TOTP authentication functions
function generateTotpSecret(email) {
  return speakeasy.generateSecret({
    name: `Retail Intelligence (${email})`,
    issuer: "Retail Intelligence",
    length: 32
  });
}

async function generateQRCode(secret) {
  return QRCode.toDataURL(secret.otpauth_url);
}

function generateBackupCodes(count = 10) {
  const codes = [];
  for (let i = 0; i < count; i++) {
    const code = crypto.randomBytes(4).toString("hex").toUpperCase();
    codes.push(code);
  }
  return codes;
}

async function hashBackupCode(code) {
  const saltRounds = 10;
  return bcrypt.hash(code, saltRounds);
}

async function verifyBackupCode(code, hash) {
  return bcrypt.compare(code, hash);
}

function verifyTotpToken(token, secret) {
  return speakeasy.totp.verify({
    secret,
    encoding: "base32",
    token,
    window: 2 // Allow 2 time windows (±30 seconds)
  });
}

module.exports = {
  createUserSession,
  getAuthenticatedUser,
  requireAuth,
  verifyGoogleCredential,
  verifySession,
  hashPassword,
  verifyPassword,
  generateTotpSecret,
  generateQRCode,
  generateBackupCodes,
  hashBackupCode,
  verifyBackupCode,
  verifyTotpToken
};
