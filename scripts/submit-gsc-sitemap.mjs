import "dotenv/config";

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

async function getAccessToken() {
  const clientId = required("GOOGLE_OAUTH_CLIENT_ID");
  const clientSecret = required("GOOGLE_OAUTH_CLIENT_SECRET");
  const refreshToken = required("GOOGLE_OAUTH_REFRESH_TOKEN");

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  const data = await response.json();
  if (!response.ok || !data.access_token) {
    throw new Error(
      `OAuth token request failed (${response.status}): ${JSON.stringify(data)}`,
    );
  }
  return data.access_token;
}

function normalizeSiteCandidates() {
  const host = process.env.SITE_HOST?.trim() || "wavetechlimited.com";
  const configured = process.env.GSC_SITE_URL?.trim();
  const candidates = [
    configured,
    `https://${host}/`,
    `sc-domain:${host}`,
  ].filter(Boolean);
  return Array.from(new Set(candidates));
}

function normalizeSitemaps() {
  const host = process.env.SITE_HOST?.trim() || "wavetechlimited.com";
  const fromEnv = process.env.GSC_SITEMAP_URLS?.trim();
  if (fromEnv) {
    return fromEnv
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
  return [`https://${host}/sitemap.xml`];
}

async function listSites(accessToken) {
  const response = await fetch("https://www.googleapis.com/webmasters/v3/sites", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(
      `GSC site list failed (${response.status}): ${JSON.stringify(data)}`,
    );
  }
  return data.siteEntry || [];
}

async function submitSitemap(accessToken, siteUrl, sitemapUrl) {
  const endpoint = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(
    siteUrl,
  )}/sitemaps/${encodeURIComponent(sitemapUrl)}`;

  const response = await fetch(endpoint, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (response.ok) {
    return { ok: true, status: response.status, siteUrl, sitemapUrl };
  }

  let payload = "";
  try {
    payload = JSON.stringify(await response.json());
  } catch {
    payload = await response.text();
  }
  return {
    ok: false,
    status: response.status,
    siteUrl,
    sitemapUrl,
    error: payload,
  };
}

async function main() {
  const accessToken = await getAccessToken();
  const knownSites = await listSites(accessToken);
  const knownSet = new Set(knownSites.map((entry) => entry.siteUrl));

  const sites = normalizeSiteCandidates();
  const sitemaps = normalizeSitemaps();

  const siteAttempts = sites.map((siteUrl) => {
    const known = knownSet.has(siteUrl);
    return { siteUrl, known };
  });

  console.log("GSC sites available:");
  for (const entry of knownSites) {
    console.log(`- ${entry.siteUrl} (${entry.permissionLevel})`);
  }

  const results = [];
  for (const site of siteAttempts) {
    for (const sitemap of sitemaps) {
      const result = await submitSitemap(accessToken, site.siteUrl, sitemap);
      results.push(result);
      const status = result.ok ? "ok" : "failed";
      const knownSuffix = site.known ? "known" : "not-listed";
      console.log(
        `[${status}] site=${site.siteUrl} (${knownSuffix}) sitemap=${sitemap} status=${result.status}`,
      );
      if (!result.ok && result.error) {
        console.log(`  error=${result.error}`);
      }
    }
  }

  const okCount = results.filter((entry) => entry.ok).length;
  if (okCount === 0) {
    throw new Error(
      "No sitemap submission succeeded. Set GSC_SITE_URL to your verified Search Console property URL.",
    );
  }

  console.log(`Done. Successful submissions: ${okCount}/${results.length}`);
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
