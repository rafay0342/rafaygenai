import pkg from "@prisma/client";
import { config } from "dotenv";

const { PrismaClient } = pkg;
config({ path: ".env.local" });
const prisma = new PrismaClient();
const [email] = process.argv.slice(2);

if (!email) {
  console.error("Usage: node scripts/promote-admin.mjs <email>");
  process.exit(1);
}

await prisma.user.update({
  where: { email },
  data: { role: "admin" },
});

console.log(`Promoted ${email} to admin`);
await prisma.$disconnect();
