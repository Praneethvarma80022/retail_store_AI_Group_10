const mongoose = require("mongoose");
require("dotenv").config();

const UserProfile = require("../models/UserProfile");
const { hashPassword, generateTotpSecret, generateBackupCodes, hashBackupCode } = require("../lib/auth");

async function seedDemoData() {
  try {
    // Connect to database
    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 5000
    });

    console.log("Connected to MongoDB");

    // Remove existing demo users
    await UserProfile.deleteMany({
      email: { $in: ["demo@retailai.com", "demo-2fa@retailai.com"] }
    });
    console.log("Cleared existing demo users (if any)");

    // Create demo user without TOTP
    const demoPassword = await hashPassword("Demo@123456789");
    const demoUser = new UserProfile({
      email: "demo@retailai.com",
      name: "Demo User",
      passwordHash: demoPassword,
      authMethod: "email",
      picture: "",
      role: "admin",
      workspaceName: "Demo Workspace",
      totpVerified: false,
      totpSecret: null,
      totpBackupCodes: [],
      googleId: undefined // Explicitly set googleId to undefined for email auth
    });

    await demoUser.save();
    console.log("✓ Demo user created");
    console.log("  Email: demo@retailai.com");
    console.log("  Password: Demo@123456789");

    // Create demo user with TOTP enabled
    const totpSecret = generateTotpSecret("demo-2fa@retailai.com");
    const backupCodes = generateBackupCodes();
    const hashedBackupCodes = await Promise.all(
      backupCodes.map((code) => hashBackupCode(code))
    );

    const demo2FAUser = new UserProfile({
      email: "demo-2fa@retailai.com",
      name: "Demo User (2FA)",
      passwordHash: await hashPassword("Demo@2FA123456"),
      authMethod: "email-totp",
      picture: "",
      role: "member",
      workspaceName: "Demo Workspace 2FA",
      totpVerified: true,
      totpSecret: totpSecret.base32,
      totpBackupCodes: hashedBackupCodes,
      googleId: undefined // Explicitly set googleId to undefined for email auth
    });

    await demo2FAUser.save();
    console.log("✓ Demo user with 2FA created");
    console.log("  Email: demo-2fa@retailai.com");
    console.log("  Password: Demo@2FA123456");
    console.log(`  TOTP Secret: ${totpSecret.base32}`);
    console.log("  Backup Codes (unencrypted):");
    backupCodes.forEach((code, i) => {
      console.log(`    ${i + 1}. ${code}`);
    });

    console.log("\n✓ Database seeding completed successfully!");
    console.log("\nYou can now login with:");
    console.log("  1. demo@retailai.com / Demo@123456789 (no 2FA)");
    console.log("  2. demo-2fa@retailai.com / Demo@2FA123456 (with 2FA enabled)");

    await mongoose.disconnect();
  } catch (error) {
    console.error("Error seeding database:", error);
    process.exit(1);
  }
}

seedDemoData();
