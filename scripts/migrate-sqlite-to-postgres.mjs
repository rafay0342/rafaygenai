#!/usr/bin/env node
/**
 * One-time migration helper: SQLite (Prisma sqlite db file) -> Postgres (Prisma client).
 *
 * Usage (run from app root):
 *   DATABASE_URL="postgresql://..." SQLITE_PATH="./prisma/dev.db" node scripts/migrate-sqlite-to-postgres.mjs
 *
 * Optional:
 *   EXPORT_DIR="./db_export"   (writes JSON snapshots of each table)
 *   TRUNCATE_FIRST="true"      (danger: wipes Postgres tables before import)
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import initSqlJs from "sql.js";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({ log: ["error", "warn"] });

function envBool(name, def = false) {
  const v = process.env[name];
  if (v == null) return def;
  return v === "1" || v.toLowerCase() === "true" || v.toLowerCase() === "yes";
}

function toDateMaybe(v) {
  if (v == null) return v;
  if (v instanceof Date) return v;
  if (typeof v === "number") return new Date(v);
  if (typeof v === "string") return new Date(v);
  return v;
}

function normalizeRow(table, row) {
  // Prisma uses Date objects for DateTime columns.
  const out = { ...row };
  const dateFieldsByTable = {
    User: ["createdAt", "updatedAt"],
    Session: ["expires"],
    VerificationToken: ["expires"],
    ApiKey: ["createdAt", "lastUsedAt"],
    Usage: ["updatedAt"],
    RateUsage: ["updatedAt"],
  };

  for (const field of dateFieldsByTable[table] ?? []) {
    if (field in out) out[field] = toDateMaybe(out[field]);
  }
  return out;
}

function rowsFromSqlJsExec(execResult) {
  if (!execResult?.length) return [];
  const { columns, values } = execResult[0];
  return values.map((vals) => {
    const row = {};
    for (let i = 0; i < columns.length; i++) row[columns[i]] = vals[i];
    return row;
  });
}

async function main() {
  const sqlitePath = process.env.SQLITE_PATH ?? "./prisma/dev.db";
  const exportDir = process.env.EXPORT_DIR;
  const truncateFirst = envBool("TRUNCATE_FIRST", false);

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required (target Postgres connection string).");
  }

  if (!fs.existsSync(sqlitePath)) {
    throw new Error(`SQLite db not found at SQLITE_PATH=${sqlitePath}`);
  }

  const sqliteBytes = fs.readFileSync(sqlitePath);
  const SQL = await initSqlJs({});
  const db = new SQL.Database(sqliteBytes);

  const tables = [
    "User",
    "Account",
    "Session",
    "VerificationToken",
    "ApiKey",
    "Usage",
    "RateUsage",
  ];

  const data = {};
  for (const t of tables) {
    // Quote table name because Prisma uses PascalCase model names.
    const rows = rowsFromSqlJsExec(db.exec(`SELECT * FROM "${t}"`)).map((r) =>
      normalizeRow(t, r),
    );
    data[t] = rows;
  }

  if (exportDir) {
    fs.mkdirSync(exportDir, { recursive: true });
    for (const t of tables) {
      const p = path.join(exportDir, `${t}.json`);
      fs.writeFileSync(p, JSON.stringify(data[t], null, 2));
    }
    console.log(`Wrote export JSON to ${exportDir}`);
  }

  if (truncateFirst) {
    // Order matters due to foreign keys.
    await prisma.rateUsage.deleteMany();
    await prisma.usage.deleteMany();
    await prisma.apiKey.deleteMany();
    await prisma.session.deleteMany();
    await prisma.account.deleteMany();
    await prisma.verificationToken.deleteMany();
    await prisma.user.deleteMany();
  }

  // Import order matters (FKs).
  const results = [];
  if (data.User.length) {
    results.push(
      await prisma.user.createMany({ data: data.User, skipDuplicates: true }),
    );
  }
  if (data.Account.length) {
    results.push(
      await prisma.account.createMany({ data: data.Account, skipDuplicates: true }),
    );
  }
  if (data.Session.length) {
    results.push(
      await prisma.session.createMany({ data: data.Session, skipDuplicates: true }),
    );
  }
  if (data.VerificationToken.length) {
    results.push(
      await prisma.verificationToken.createMany({
        data: data.VerificationToken,
        skipDuplicates: true,
      }),
    );
  }
  if (data.ApiKey.length) {
    results.push(
      await prisma.apiKey.createMany({ data: data.ApiKey, skipDuplicates: true }),
    );
  }
  if (data.Usage.length) {
    results.push(
      await prisma.usage.createMany({ data: data.Usage, skipDuplicates: true }),
    );
  }
  if (data.RateUsage.length) {
    results.push(
      await prisma.rateUsage.createMany({
        data: data.RateUsage,
        skipDuplicates: true,
      }),
    );
  }

  const counts = {};
  for (const t of tables) counts[t] = data[t].length;

  console.log("SQLite row counts:", counts);
  console.log("Postgres createMany results:", results.map((r) => r.count));
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => {});
  });

