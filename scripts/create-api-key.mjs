import { config } from "dotenv";
import crypto from "crypto";
import { PrismaClient } from "@prisma/client";

const email = process.argv[2];
const name = process.argv[3] || "New key";

if (!email) {
  console.error("Usage: node scripts/create-api-key.mjs <email> [name]");
  process.exit(1);
}

config({ path: ".env.local" });
const prisma = new PrismaClient();

function hashSecret(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function generateApiKey() {
  const prefix = "grok";
  const token = crypto.randomBytes(32).toString("hex");
  const plain = `${prefix}_${token}`;
  return { plain, prefix, hash: hashSecret(plain) };
}

const user = await prisma.user.findUnique({ where: { email } });
if (!user) {
  console.error("User not found:", email);
  await prisma.$disconnect();
  process.exit(1);
}

const { plain, prefix, hash } = generateApiKey();
const saved = await prisma.apiKey.create({
  data: { name, prefix, keyHash: hash, userId: user.id },
});

console.log("NEW_API_KEY:", plain);
console.log("KEY_ID:", saved.id);

await prisma.$disconnect();
