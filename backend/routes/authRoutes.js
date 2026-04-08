const express = require("express");

const asyncHandler = require("../lib/asyncHandler");
const { createHttpError } = require("../lib/errors");
const {
  createUserSession,
  getAuthenticatedUser,
  verifyGoogleCredential,
  hashPassword,
  verifyPassword,
  generateTotpSecret,
  generateQRCode,
  generateBackupCodes,
  hashBackupCode,
  verifyBackupCode,
  verifyTotpToken
} = require("../lib/auth");
const { normalizeText } = require("../lib/validators");
const { provisionUserProfile } = require("../services/userProfileService");
const UserProfile = require("../models/UserProfile");

const router = express.Router();

router.get("/config", (req, res) => {
  res.json({
    googleClientId: process.env.GOOGLE_CLIENT_ID || "",
    googleConfigured: Boolean(process.env.GOOGLE_CLIENT_ID)
  });
});

router.get(
  "/me",
  asyncHandler(async (req, res) => {
    const session = getAuthenticatedUser(req);

    res.json({
      user: {
        id: session.sub,
        email: session.email,
        name: session.name,
        picture: session.picture,
        role: session.role || "admin",
        workspaceName: session.workspaceName || ""
      }
    });
  })
);

router.post(
  "/google",
  asyncHandler(async (req, res) => {
    const credential = normalizeText(req.body?.credential);

    if (!credential) {
      throw createHttpError(400, "Google credential is required.");
    }

    const googleUser = await verifyGoogleCredential(credential);
    const profile = await provisionUserProfile(googleUser);
    const session = createUserSession(profile);

    res.json(session);
  })
);

// Email/Password Registration
router.post(
  "/register",
  asyncHandler(async (req, res) => {
    const { email, password, name } = req.body;

    if (!email || !password || !name) {
      throw createHttpError(400, "Email, password, and name are required.");
    }

    if (password.length < 8) {
      throw createHttpError(400, "Password must be at least 8 characters long.");
    }

    // Check if user already exists
    const existingUser = await UserProfile.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      throw createHttpError(400, "Email already registered.");
    }

    // Hash password and create user
    const passwordHash = await hashPassword(password);
    const user = new UserProfile({
      email: email.toLowerCase(),
      name: name.trim(),
      passwordHash,
      picture: "",
      authMethod: "email"
    });

    await user.save();

    // Create session
    const session = createUserSession({
      id: user._id.toString(),
      email: user.email,
      name: user.name,
      picture: user.picture,
      role: user.role,
      workspaceName: user.workspaceName
    });

    res.json(session);
  })
);

// Email/Password Login
router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
      throw createHttpError(400, "Email and password are required.");
    }

    const user = await UserProfile.findOne({ email: email.toLowerCase() });
    if (!user || !user.passwordHash) {
      throw createHttpError(401, "Invalid email or password.");
    }

    const isPasswordValid = await verifyPassword(password, user.passwordHash);
    if (!isPasswordValid) {
      throw createHttpError(401, "Invalid email or password.");
    }

    // If TOTP is enabled, return partial session requiring TOTP verification
    if (user.totpVerified && user.totpSecret) {
      return res.json({
        requiresTOTP: true,
        tempToken: createUserSession(user).token,
        user: {
          id: user._id.toString(),
          email: user.email,
          name: user.name
        }
      });
    }

    // Create full session
    const session = createUserSession({
      id: user._id.toString(),
      email: user.email,
      name: user.name,
      picture: user.picture,
      role: user.role,
      workspaceName: user.workspaceName
    });

    res.json(session);
  })
);

// Setup TOTP - Generate secret and QR code
router.post(
  "/totp/setup",
  asyncHandler(async (req, res) => {
    const session = getAuthenticatedUser(req);
    const user = await UserProfile.findById(session.sub);

    if (!user) {
      throw createHttpError(404, "User not found.");
    }

    // Generate new TOTP secret
    const secret = generateTotpSecret(user.email);
    const qrCode = await generateQRCode(secret);
    const backupCodes = generateBackupCodes();

    // Store unverified secret and backup codes (hashed)
    user.totpSecret = secret.base32;
    user.totpVerified = false;
    user.totpBackupCodes = await Promise.all(
      backupCodes.map((code) => hashBackupCode(code))
    );

    await user.save();

    res.json({
      secret: secret.base32,
      qrCode,
      backupCodes
    });
  })
);

// Verify TOTP - Confirm the setupwith a TOTP token
router.post(
  "/totp/verify",
  asyncHandler(async (req, res) => {
    const session = getAuthenticatedUser(req);
    const { token } = req.body;

    if (!token) {
      throw createHttpError(400, "TOTP token is required.");
    }

    const user = await UserProfile.findById(session.sub);
    if (!user || !user.totpSecret) {
      throw createHttpError(400, "TOTP setup not initiated.");
    }

    const isValid = verifyTotpToken(token, user.totpSecret);
    if (!isValid) {
      throw createHttpError(401, "Invalid TOTP token.");
    }

    // Mark TOTP as verified
    user.totpVerified = true;
    user.authMethod = "email-totp";
    await user.save();

    res.json({
      success: true,
      message: "TOTP verified successfully."
    });
  })
);

// Verify TOTP during login
router.post(
  "/totp/verify-login",
  asyncHandler(async (req, res) => {
    const { email, token } = req.body;

    if (!email || !token) {
      throw createHttpError(400, "Email and TOTP token are required.");
    }

    const user = await UserProfile.findOne({ email: email.toLowerCase() });
    if (!user || !user.totpSecret || !user.totpVerified) {
      throw createHttpError(401, "Invalid email or TOTP is not enabled.");
    }

    // Try TOTP token first
    let isValid = verifyTotpToken(token, user.totpSecret);

    // If TOTP fails, check backup codes
    if (!isValid) {
      for (let i = 0; i < user.totpBackupCodes.length; i++) {
        const codeIsValid = await verifyBackupCode(token, user.totpBackupCodes[i]);
        if (codeIsValid) {
          // Remove used backup code
          user.totpBackupCodes.splice(i, 1);
          await user.save();
          isValid = true;
          break;
        }
      }
    }

    if (!isValid) {
      throw createHttpError(401, "Invalid TOTP token or backup code.");
    }

    // Create session
    const session = createUserSession({
      id: user._id.toString(),
      email: user.email,
      name: user.name,
      picture: user.picture,
      role: user.role,
      workspaceName: user.workspaceName
    });

    res.json(session);
  })
);

// Disable TOTP
router.post(
  "/totp/disable",
  asyncHandler(async (req, res) => {
    const session = getAuthenticatedUser(req);
    const user = await UserProfile.findById(session.sub);

    if (!user) {
      throw createHttpError(404, "User not found.");
    }

    user.totpSecret = null;
    user.totpVerified = false;
    user.totpBackupCodes = [];
    user.authMethod = "email";
    await user.save();

    res.json({
      success: true,
      message: "TOTP disabled successfully."
    });
  })
);

module.exports = router;
