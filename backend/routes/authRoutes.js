const express = require("express");

const asyncHandler = require("../lib/asyncHandler");
const { createHttpError } = require("../lib/errors");
const {
  createUserSession,
  getAuthenticatedUser,
  verifyGoogleCredential
} = require("../lib/auth");
const { normalizeText } = require("../lib/validators");

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
        picture: session.picture
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
    const session = createUserSession(googleUser);

    res.json(session);
  })
);

module.exports = router;
