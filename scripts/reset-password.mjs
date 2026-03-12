import pkg from "@prisma/client";
import { config } from "dotenv";
import bcrypt from "bcryptjs";
import { existsSync } from "node:fs";

const envFlagIndex = process.argv.indexOf("--env");
const envPath =
  envFlagIndex !== -1 ? process.argv[envFlagIndex + 1] : undefined;

const fallbackEnv = existsSync(".env.local")
  ? ".env.local"
  : existsSync(".env")
    ? ".env"
    : undefined;

if (envPath || fallbackEnv) {
  config({ path: envPath ?? fallbackEnv });
}

const { PrismaClient } = pkg;
const prisma = new PrismaClient();

const [rawEmail, password] = process.argv
  .filter((arg, idx) => {
    if (envFlagIndex === -1) return true;
    return idx !== envFlagIndex && idx !== envFlagIndex + 1;
  })
  .slice(2);
const email = rawEmail ? rawEmail.trim().toLowerCase() : "";

if (!email || !password) {
  console.error(
    "Usage: node scripts/reset-password.mjs <email> <newPassword> [--env <path>]",
  );
  process.exit(1);
}

const user = await prisma.user.findUnique({
  where: { email },
  select: { id: true, email: true },
});

if (!user) {
  console.error(`User not found: ${email}`);
  await prisma.$disconnect();
  process.exit(1);
}

const passwordHash = await bcrypt.hash(password, 10);

await prisma.user.update({
  where: { id: user.id },
  data: { passwordHash },
});

console.log(`Password reset for ${user.email}`);
await prisma.$disconnect();
