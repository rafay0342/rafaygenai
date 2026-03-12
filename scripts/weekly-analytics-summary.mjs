#!/usr/bin/env node
// Lightweight weekly analytics summary email/stubbed sender.
import fs from "fs/promises";
import path from "path";

const SUMMARY_PATH =
  process.env.ANALYTICS_SUMMARY_PATH?.trim() ||
  path.join(process.cwd(), "data", "analytics-summary.json");

async function loadSummary() {
  const raw = await fs.readFile(SUMMARY_PATH, "utf8").catch(() => null);
  return raw ? JSON.parse(raw) : null;
}

function pct(n, d) {
  if (!d) return "0%";
  return `${Math.round((n / d) * 100)}%`;
}

function pickWinner(variants) {
  const keys = Object.keys(variants || {});
  const ranked = keys
    .map((k) => {
      const v = variants[k];
      const ctr = v?.impressions ? v.clicks / v.impressions : 0;
      return { k, ctr, clicks: v?.clicks || 0, impressions: v?.impressions || 0 };
    })
    .filter((r) => r.impressions > 0)
    .sort((a, b) => {
      if (b.ctr !== a.ctr) return b.ctr - a.ctr;
      if (b.clicks !== a.clicks) return b.clicks - a.clicks;
      return b.impressions - a.impressions;
    });
  return ranked[0]?.k || null;
}

function formatPageList(summary) {
  const pages = Object.entries(summary.pages || {}).map(([p, data]) => ({
    path: p,
    views: data.views,
    clicks: data.clicks,
    avgTimeSec: data.timeCount ? Math.round(data.timeTotalMs / data.timeCount / 1000) : 0,
  }));
  const byClicks = pages.sort((a, b) => b.clicks - a.clicks).slice(0, 5);
  return byClicks
    .map((p, idx) => `${idx + 1}. ${p.path} — ${p.clicks} clicks, ${p.views} views, ${p.avgTimeSec}s avg time`)
    .join("\n");
}

async function main() {
  const summary = await loadSummary();
  if (!summary) {
    console.error("No analytics-summary.json found; skipping.");
    process.exit(1);
  }

  const winner = pickWinner(summary.variants || {});
  const body = `Weekly Analytics Snapshot\nUpdated: ${summary.updatedAt}\n\nTraffic: Sessions ${summary.totals.sessions}, Page Views ${summary.totals.pageViews}, Page Clicks ${summary.totals.pageClicks}, Buttons ${summary.totals.buttonClicks}\n\nA/B/C\nA: ${summary.variants.a.impressions} imp / ${summary.variants.a.clicks} clicks (${pct(summary.variants.a.clicks, summary.variants.a.impressions)})\nB: ${summary.variants.b.impressions} imp / ${summary.variants.b.clicks} clicks (${pct(summary.variants.b.clicks, summary.variants.b.impressions)})\nC: ${summary.variants.c.impressions} imp / ${summary.variants.c.clicks} clicks (${pct(summary.variants.c.clicks, summary.variants.c.impressions)})\nWinner: ${winner || "n/a"}\n\nTop Pages (by clicks)\n${formatPageList(summary)}\n\nTop Traffic Sources\n${Object.entries(summary.traffic || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n")}\n\nTop Buttons\n${Object.entries(summary.buttons || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n")}\n`;

  // Placeholder send: print to stdout. Wire to SMTP/API by setting SEND_COMMAND.
  const sendCmd = process.env.SEND_COMMAND;
  if (!sendCmd) {
    console.log(body);
    return;
  }

  const { exec } = await import("child_process");
  exec(`${sendCmd} <<'EOF'\n${body}\nEOF`, (err, stdout, stderr) => {
    if (err) {
      console.error("send failed", err, stderr);
      process.exit(1);
    }
    console.log(stdout);
  });
}

main();
