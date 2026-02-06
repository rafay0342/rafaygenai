import pkg from "@prisma/client";
import { config } from "dotenv";

config({ path: ".env.local" });
const { PrismaClient } = pkg;
const prisma = new PrismaClient();

const users = await prisma.user.findMany({
  select: { email: true, role: true, createdAt: true },
  orderBy: { createdAt: "asc" },
});

for (const user of users) {
  console.log(`${user.email} (${user.role})`);
}

await prisma.$disconnect();
