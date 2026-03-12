#!/usr/bin/env node

"use strict";

const { promises: fs } = require("fs");
const path = require("path");

const SUMMARY_PATH =
  process.env.ANALYTICS_SUMMARY_PATH?.trim() ||
  path.join(process.cwd(), "data", "analytics-summary.json");

async function loadSummary() {
  try {
    const raw = await fs.readFile(SUMMARY_PATH, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function checkThresholds(summary) {
  const warnings = [];
  if (!summary) {
    warnings.push("Analytics summary missing or unreadable.");
    return warnings;
  }
  if (summary.totals.sessions < 10) {
    warnings.push("Sessions dropped below 10.");
  }
  if (summary.totals.pageViews < 50) {
    warnings.push("Page views under 50.");
  }
  if (summary.totals.pageClicks < 5) {
    warnings.push("Page clicks under 5.");
  }
  return warnings;
}

async function main() {
  const summary = await loadSummary();
  const warnings = checkThresholds(summary);
  if (warnings.length) {
    console.error("⚠️ Analytics alerts:");
    warnings.forEach((warn) => console.error(" •", warn));
    process.exitCode = 2;
  } else {
    console.log("✅ Analytics summary within healthy thresholds.");
  }
}

main().catch((error) => {
  console.error("Failed to run analytics alert script:", error);
  process.exitCode = 4;
});
