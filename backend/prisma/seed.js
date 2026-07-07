import "dotenv/config";
import { prisma } from "../src/config/db.js";
import { createMerchant } from "../src/services/merchant.service.js";
import { createAdmin, getAdminByEmail } from "../src/services/admin-auth.service.js";

const OWNER = {
  name: process.env.SEED_MERCHANT_NAME || "DRP Owner",
  email: process.env.SEED_MERCHANT_EMAIL || undefined,
  staticQris: process.env.SEED_STATIC_QRIS,
  webhookUrl: process.env.SEED_WEBHOOK_URL || undefined,
};

async function main() {
  // --- Seed admin ---
  const adminName = process.env.ADMIN_NAME || "Owner";
  const adminEmail = process.env.ADMIN_EMAIL || "admin@drp.local";
  const adminPassword = process.env.ADMIN_PASSWORD || "admin123";
  const adminToken = process.env.ADMIN_TOKEN;

  const existingAdmin = await getAdminByEmail(adminEmail);
  if (!existingAdmin) {
    const admin = await createAdmin({
      name: adminName,
      email: adminEmail,
      password: adminPassword,
      apiToken: adminToken,
    });
    console.log("\n=== ADMIN CREATED ===");
    console.log("Nama     :", admin.name);
    console.log("Email    :", admin.email);
    console.log("Password :", adminPassword);
    console.log(
      adminToken
        ? `Token    : ${adminToken} (from ADMIN_TOKEN env)`
        : `Token    : ${admin.apiToken} (auto-generated)`
    );
  } else {
    console.log("Admin already exists, skipping.");
  }

  // --- Seed first merchant (optional) ---
  if (!OWNER.staticQris) {
    console.log(
      "\nSet SEED_STATIC_QRIS in .env to seed the first merchant."
    );
    return;
  }

  const { merchant, rawApiKey } = await createMerchant(OWNER);

  console.log("\n=== MERCHANT CREATED ===");
  console.log("ID           :", merchant.id);
  console.log("Name         :", merchant.name);
  console.log("Email        :", merchant.email ?? "(none)");
  console.log("API Key hint :", merchant.apiKeyHint);
  console.log("API Key      :", rawApiKey);
  console.log("Webhook URL  :", merchant.webhookUrl ?? "(none — set later)");
  console.log("Webhook Secret:", merchant.webhookSecret);
  console.log("\nStore these credentials securely. They will NOT be shown again.\n");
}

main()
  .catch((e) => {
    console.error("Seed failed:", e.message);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
