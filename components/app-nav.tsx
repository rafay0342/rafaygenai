"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useSession as useSessionBase, signOut } from "next-auth/react";
import ThemeToggle from "@/components/theme-toggle";
import { RafaygenLogo } from "@/components/ui/rafaygen-logo";

const PRIMARY_LINKS = [
  { href: "/pricing", label: "Pricing" },
  { href: "/resources", label: "Resources" },
  { href: "/docs", label: "Docs" },
  { href: "/wavetechlimited", label: "About Us" },
  { href: "/contact", label: "Contact" },
] as const;

export function AppNav() {
  const safeUseSession =
    (typeof useSessionBase === "function" ? useSessionBase : null) ??
    (() => ({ data: null, status: "unauthenticated" as const }));
  const sessionState =
    typeof safeUseSession === "function"
      ? safeUseSession()
      : { data: null, status: "unauthenticated" as const };
  const status = sessionState?.status || "unauthenticated";
  const isAuthenticated = status === "authenticated";
  const studioHref = isAuthenticated ? "/studio" : "/login?redirect=/studio";
  const studioNewHref = isAuthenticated ? "/studio?new=1" : "/login?redirect=/studio";
  const pathname = usePathname();
  const isStudio = pathname?.startsWith("/studio");
  const isAdmin = pathname?.startsWith("/admin");
  const hideNav = isStudio || isAdmin;

  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [menuOpen]);

  if (!mounted || hideNav) return null;

  const closeMenu = () => setMenuOpen(false);

  return (
    <>
      <header className={`rg-nav${scrolled ? " rg-nav--scrolled" : ""}`}>
        <div className="rg-nav-inner">
          <div className="rg-nav-left">
            <RafaygenLogo variant="lockup" size="lg" href="/" className="rg-site-logo" onClick={closeMenu} />
          </div>

          <nav className="rg-nav-links" aria-label="Primary">
            {PRIMARY_LINKS.map((item) => (
              <Link key={item.href} href={item.href} className="rg-nav-link">
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="rg-nav-right rg-nav-right--desktop">
            <ThemeToggle variant="apple" />
            {isAuthenticated ? (
              <>
                <Link href={studioHref} className="rg-btn rg-btn-primary">Open Studio</Link>
                <button type="button" className="rg-btn rg-btn-ghost" onClick={() => void signOut({ callbackUrl: "/login" })}>Sign out</button>
              </>
            ) : (
              <>
                <Link href="/login" className="rg-btn rg-btn-ghost">Sign in</Link>
                <Link href={studioNewHref} className="rg-btn rg-btn-primary">Try Free</Link>
              </>
            )}
          </div>

          <div className="rg-nav-mobile-actions">
            <ThemeToggle variant="apple" />
            <button
              type="button"
              className="rg-menu-btn"
              aria-expanded={menuOpen}
              aria-controls="rg-mobile-menu"
              aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"}
              onClick={() => setMenuOpen((open) => !open)}
            >
              <span>{menuOpen ? "Close" : "Menu"}</span>
              <span className={`rg-menu-icon${menuOpen ? " rg-menu-icon--open" : ""}`} aria-hidden="true">
                <span />
                <span />
                <span />
              </span>
            </button>
          </div>
        </div>

        <div id="rg-mobile-menu" className="rg-mobile-panel" hidden={!menuOpen}>
          <nav className="rg-mobile-links" aria-label="Mobile">
            {PRIMARY_LINKS.map((item) => (
              <Link key={item.href} href={item.href} className="rg-mobile-link" onClick={closeMenu}>
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="rg-mobile-actions">
            {isAuthenticated ? (
              <>
                <Link href={studioHref} className="rg-btn rg-btn-primary" onClick={closeMenu}>Open Studio</Link>
                <button
                  type="button"
                  className="rg-btn rg-btn-ghost"
                  onClick={() => {
                    closeMenu();
                    void signOut({ callbackUrl: "/login" });
                  }}
                >
                  Sign out
                </button>
              </>
            ) : (
              <>
                <Link href="/login" className="rg-btn rg-btn-ghost" onClick={closeMenu}>Sign in</Link>
                <Link href={studioNewHref} className="rg-btn rg-btn-primary" onClick={closeMenu}>Try Free</Link>
              </>
            )}
          </div>
        </div>
      </header>
      <div className="rg-nav-spacer" aria-hidden="true" />
    </>
  );
}
