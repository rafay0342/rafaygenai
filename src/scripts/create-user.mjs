import pkg from "@prisma/client";
import { config } from "dotenv";
import bcrypt from "bcryptjs";

config({ path: ".env.local" });
const { PrismaClient } = pkg;
const prisma = new PrismaClient();

const [email, password] = process.argv.slice(2);

if (!email || !password) {
  console.error("Usage: node scripts/create-user.mjs <email> <password>");
  process.exit(1);
}

const passwordHash = await bcrypt.hash(password, 10);

await prisma.user.create({
  data: {
    email,
    passwordHash,
  },
});

console.log(`Created user ${email}`);
await prisma.$disconnect();
