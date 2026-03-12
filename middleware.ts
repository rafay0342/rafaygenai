import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

function hashString(input: string) {
  let hash = 5381;
  for (let i = 0; i < input.length; i += 1) {
    hash = ((hash << 5) + hash) ^ input.charCodeAt(i);
  }
  return hash >>> 0;
}

function pickStableVariant(seed: string) {
  const bucket = hashString(seed) % 3;
  if (bucket === 0) return "a";
  if (bucket === 1) return "b";
  return "c";
}

function getClientSeed(req: NextRequest) {
  const userAgent = req.headers.get("user-agent") || "";
  const forwardedFor = req.headers.get("x-forwarded-for") || "";
  const realIp = req.headers.get("x-real-ip") || "";
  const ip = forwardedFor.split(",")[0]?.trim() || realIp || "0.0.0.0";
  return `${ip}|${userAgent}`;
}

function isBotRequest(req: NextRequest) {
  const userAgent = (req.headers.get("user-agent") || "").toLowerCase();
  return (
    userAgent.includes("bot") ||
    userAgent.includes("crawl") ||
    userAgent.includes("spider") ||
    userAgent.includes("slurp") ||
    userAgent.includes("bingpreview") ||
    userAgent.includes("facebookexternalhit") ||
    userAgent.includes("whatsapp") ||
    userAgent.includes("telegram")
  );
}

export async function middleware(req: NextRequest) {
  const host = (req.headers.get("host") || "").toLowerCase();
  if (host === "wavetechlimited.com" || host === "wavetechlimited.com:5000") {
    const url = req.nextUrl.clone();
    url.protocol = "https:";
    url.hostname = "www.wavetechlimited.com";
    url.port = "";
    return NextResponse.redirect(url, 308);
  }

  const { pathname } = req.nextUrl;

  if (pathname === "/start") {
    if (isBotRequest(req)) {
      return NextResponse.next();
    }

    const existing = req.cookies.get("ab_start_variant")?.value;
    const override = req.nextUrl.searchParams.get("variant");
    const sanitizedOverride = override === "a" || override === "b" || override === "c" ? override : null;
    const variant =
      sanitizedOverride ||
      (existing === "a" || existing === "b" || existing === "c"
        ? existing
        : pickStableVariant(getClientSeed(req)));
    const cookieOptions = {
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
      sameSite: "lax" as const,
      secure: req.nextUrl.protocol === "https:",
    };

    if (variant === "b") {
      const rewriteUrl = req.nextUrl.clone();
      rewriteUrl.pathname = "/start-b";
      const res = NextResponse.rewrite(rewriteUrl);
      if (!existing || sanitizedOverride) {
        res.cookies.set("ab_start_variant", "b", cookieOptions);
      }
      return res;
    }

    if (variant === "c") {
      const redirectUrl = req.nextUrl.clone();
      redirectUrl.pathname = "/";
      redirectUrl.searchParams.set("ab", "start_c");
      const res = NextResponse.redirect(redirectUrl);
      if (!existing || sanitizedOverride) {
        res.cookies.set("ab_start_variant", "c", cookieOptions);
      }
      return res;
    }

    if (!existing || sanitizedOverride) {
      const res = NextResponse.next();
      res.cookies.set("ab_start_variant", "a", cookieOptions);
      return res;
    }
    return NextResponse.next();
  }

  // Keep a public, crawlable homepage for SEO/AdSense review.
  // Authenticated users still land directly in Studio.
  if (pathname === "/") {
    if (isBotRequest(req)) {
      return NextResponse.next();
    }
    if (req.nextUrl.searchParams.get("force_home") === "1") {
      return NextResponse.next();
    }
    const token = await getToken({ req });
    if (token) {
      const studioUrl = new URL("/studio", req.url);
      return NextResponse.redirect(studioUrl);
    }
    return NextResponse.next();
  }

  // Public API paths
  if (
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/video-jobs") ||
    pathname.startsWith("/api/video-webhook") ||
    pathname.startsWith("/api/admin/") ||
    pathname.startsWith("/api/ab/track") ||
    pathname.startsWith("/api/analytics/track") ||
    pathname.startsWith("/api/debug") ||
    pathname.startsWith("/api/models") ||
    pathname.startsWith("/api/chat") ||
    pathname.startsWith("/api/media/") ||
    pathname.startsWith("/api/tools/") ||
    pathname.startsWith("/api/generate-") ||
    pathname.startsWith("/api/upscale-image") ||
    pathname.startsWith("/api/media-limit") ||
    pathname.startsWith("/api/usage")
  ) {
    return NextResponse.next();
  }

  // Allow API requests with grok bearer
  const authHeader = req.headers.get("authorization");
  if (pathname.startsWith("/api") && authHeader?.toLowerCase().startsWith("grok ")) {
    return NextResponse.next();
  }

  // Require session for protected pages and APIs in matcher.
  const token = await getToken({ req });
  if (!token) {
    if (pathname.startsWith("/api")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const loginUrl = new URL("/login", req.url);
    const nextPath = `${pathname}${req.nextUrl.search}`;
    loginUrl.searchParams.set("next", nextPath || "/");
    return NextResponse.redirect(loginUrl);
  }

  // Allow signed-in admins into /admin via NextAuth
  if (pathname.startsWith("/admin") && token?.role === "admin") {
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/start", "/studio/:path*", "/video/:path*", "/api/:path*"],
};
