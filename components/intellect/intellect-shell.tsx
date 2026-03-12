"use client";
/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { BrandAvatar } from "@/components/intellect/brand-avatar";
import { RafaygenLogo } from "@/components/ui/rafaygen-logo";
import { THEME_CHANGE_EVENT } from "@/components/theme-toggle";

type ShellMode = "excluded" | "auth" | "template";

type ShellContextValue = {
  sidebarCollapsed: boolean;
};

const IntellectShellContext = createContext<ShellContextValue>({
  sidebarCollapsed: false,
});

const SIDEBAR_STORAGE_KEY = "intellect:sidebar-collapsed";

const TEMPLATE_ROUTE_PREFIXES = [
  "/",
  "/community-feed",
  "/community-details",
  "/manage-subscription",
  "/chatbot",
  "/image-generator",
  "/voicegenerator",
  "/faq",
  "/docs",
  "/resources",
  "/contact",
  "/advertise",
  "/monetization-ready",
  "/privacy",
  "/terms",
  "/content-policy",
  "/copyright",
  "/seo",
  "/video",
  "/rafaygen-ai",
  "/wavetechlimited",
  "/pricing",
  "/start",
  "/login",
  "/register",
  "/reset-password",
  "/signup",
];

const AUTH_ROUTE_PREFIXES = ["/login", "/register", "/reset-password", "/signup"];
const EXCLUDED_ROUTE_PREFIXES = ["/studio", "/admin"];

function matchPath(pathname: string, target: string) {
  if (target === "/") return pathname === "/";
  return pathname === target || pathname.startsWith(`${target}/`);
}

function getShellMode(pathname: string): ShellMode {
  if (EXCLUDED_ROUTE_PREFIXES.some((prefix) => matchPath(pathname, prefix))) {
    return "excluded";
  }
  if (AUTH_ROUTE_PREFIXES.some((prefix) => matchPath(pathname, prefix))) {
    return "auth";
  }
  if (TEMPLATE_ROUTE_PREFIXES.some((prefix) => matchPath(pathname, prefix))) {
    return "template";
  }
  return "excluded";
}

function cx(...items: Array<string | false | null | undefined>) {
  return items.filter(Boolean).join(" ");
}

function readTheme() {
  if (typeof window === "undefined") return "light";
  const stored = window.localStorage.getItem("rafaygen:theme");
  if (stored === "dark" || stored === "claude") return "dark";
  return "light";
}

function routeBodyClasses(pathname: string, mode: ShellMode) {
  const classes = ["intellect-template-active"];
  if (mode === "auth") {
    classes.push("register");
    if (matchPath(pathname, "/login")) classes.push("page-login");
    return classes;
  }
  if (matchPath(pathname, "/community-feed")) classes.push("community-feed");
  if (
    matchPath(pathname, "/chatbot") ||
    matchPath(pathname, "/image-generator") ||
    matchPath(pathname, "/voicegenerator")
  ) {
    classes.push("chatbot");
  }
  return classes;
}

function planLabel(role?: string) {
  const normalized = (role || "free").toLowerCase();
  if (normalized === "owner" || normalized === "admin") return "Owner";
  if (normalized === "business") return "Business";
  if (normalized === "premium") return "Premium";
  if (normalized === "pro") return "Pro";
  return "Free";
}

export function useIntellectShell() {
  return useContext(IntellectShellContext);
}

export function TemplatePageContent({
  children,
  className,
  centerContent = false,
  stickyComposer = false,
}: {
  children: ReactNode;
  className?: string;
  centerContent?: boolean;
  stickyComposer?: boolean;
}) {
  const { sidebarCollapsed } = useIntellectShell();
  return (
    <div
      className={cx(
        "main-center-content-m-left",
        centerContent && "center-content",
        stickyComposer && "search-sticky",
        sidebarCollapsed && "collapsed",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function TemplateCopyright() {
  return (
    <div className="copyright-area-bottom">
      <p>
        <Link href="/">WaveTech Limited</Link> 2026. All Rights Reserved.
      </p>
    </div>
  );
}

function ThemeModeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const sync = () => setTheme(readTheme() as "light" | "dark");
    sync();
    window.addEventListener(THEME_CHANGE_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(THEME_CHANGE_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const toggle = () => {
    const next = theme === "light" ? "dark" : "light";
    window.localStorage.setItem("rafaygen:theme", next);
    document.documentElement.setAttribute("data-theme", next);
    window.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT, { detail: { mode: next } }));
    setTheme(next);
  };

  return (
    <button type="button" className="intellect-icon-button" onClick={toggle} aria-label="Toggle theme">
      {theme === "light" ? (
        <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
          <path
            d="M10.625 1.25H9.375V4.375H10.625V1.25ZM15.7452 3.37099L13.5541 5.56213L14.4379 6.44593L16.629 4.25478L15.7452 3.37099ZM15.625 9.375H18.75V10.625H15.625V9.375ZM14.4379 13.5541L13.5541 14.4379L15.7452 16.629L16.629 15.7452L14.4379 13.5541ZM9.375 15.625H10.625V18.75H9.375V15.625ZM5.56212 13.5541L3.37097 15.7452L4.25477 16.629L6.44591 14.4379L5.56212 13.5541ZM1.25 9.375H4.375V10.625H1.25V9.375ZM4.25479 3.37097L3.37099 4.25476L5.56214 6.44591L6.44593 5.56211L4.25479 3.37097ZM10 7.5A2.5 2.5 0 1 0 10 12.5A2.5 2.5 0 1 0 10 7.5Z"
            fill="#08395D"
          />
        </svg>
      ) : (
        <svg width="18" height="16" viewBox="0 0 18 16" aria-hidden="true">
          <path
            d="M2.43606 9.58151C3.65752 9.87564 4.92547 9.92252 6.16531 9.71938C7.40516 9.51625 8.59186 9.0672 9.65559 8.39867C10.7193 7.73013 11.6386 6.85561 12.3594 5.82654C13.0802 4.79747 13.5878 3.63465 13.8526 2.40648C14.5174 3.05723 15.0448 3.83492 15.4033 4.69337C15.7619 5.55183 15.9443 6.47357 15.9398 7.40388C15.9393 7.49044 15.9419 7.57777 15.9382 7.665C15.8708 9.2842 15.2384 10.8287 14.1508 12.0301C13.0632 13.2316 11.5892 14.0141 9.98463 14.2419C8.38012 14.4696 6.74651 14.1282 5.36754 13.2768C3.98858 12.4255 2.95137 11.118 2.43606 9.58151V9.58151Z"
            fill="#F3F3F3"
          />
        </svg>
      )}
    </button>
  );
}

const MENU_SECTIONS = [
  [
    { href: "/", label: "Home", icon: "/intellect/images/icons/01.png" },
    { href: "/community-feed", label: "Knowledge Feed", icon: "/intellect/images/icons/02.png" },
    { href: "/community-details", label: "Article View", icon: "/intellect/images/icons/02.png", prefetch: false, disabled: true },
    { href: "/manage-subscription", label: "Plans & Billing", icon: "/intellect/images/icons/03.png" },
  ],
  [
    { href: "/chatbot", label: "AI Chat", icon: "/intellect/images/icons/04.png" },
    { href: "/image-generator", label: "Image Studio", icon: "/intellect/images/icons/05.png" },
    { href: "/voicegenerator", label: "Voice Studio", icon: "/intellect/images/icons/06.png" },
  ],
];

function ShellSidebar({
  pathname,
  collapsed,
  mobileOpen,
  onCloseMobile,
  onToggleSettings,
  settingsOpen,
}: {
  pathname: string;
  collapsed: boolean;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  onToggleSettings: () => void;
  settingsOpen: boolean;
}) {
  const { data: session } = useSession();
  const displayName = session?.user?.name || "RafayGen User";
  const displayEmail = session?.user?.email || "Sign in for saved sessions";

  return (
    <div className={cx("left-side-bar", collapsed && "collapsed", mobileOpen && "mobile-open")}>
      <button
        type="button"
        className="overlay-mobile-area"
        onClick={onCloseMobile}
        aria-label="Close navigation"
      />
      <div className="inner">
        {MENU_SECTIONS.map((group, groupIndex) => (
          <div key={groupIndex} className="single-menu-wrapper">
            {group.map((item) =>
              item.disabled ? (
                <div key={item.href} className="single-menu openuptip disabled-link" aria-disabled="true">
                  <div className="icon">
                    <img src={item.icon} alt="" />
                  </div>
                  <p>{item.label}</p>
                </div>
              ) : (
                <Link
                  key={item.href}
                  href={item.href}
                  prefetch={item.prefetch === false ? false : undefined}
                  onClick={onCloseMobile}
                  className={cx("single-menu openuptip", matchPath(pathname, item.href) && "active")}
                >
                  <div className="icon">
                    <img src={item.icon} alt="" />
                  </div>
                  <p>{item.label}</p>
                </Link>
              ),
            )}
          </div>
        ))}

        <div className="single-menu-wrapper">
          <Link href="/register" className="single-menu" onClick={onCloseMobile}>
            <div className="icon">
              <img src="/intellect/images/icons/07.png" alt="" />
            </div>
            <p>Register</p>
          </Link>
          <button
            type="button"
            onClick={onToggleSettings}
            className="collapse-btn collapsed single-menu intellect-sidebar-button"
            aria-expanded={settingsOpen}
          >
            <div className="icon">
              <img src="/intellect/images/icons/08.png" alt="" />
            </div>
            <p>Settings</p>
          </button>
          <ul className="submenu rts-default-sidebar-list" style={{ display: settingsOpen ? "block" : "none" }}>
            <li>
              <Link href="/faq" className={matchPath(pathname, "/faq") ? "active" : ""} onClick={onCloseMobile}>
                <i className="fa-sharp fa-regular fa-user" />
                <span>FAQ&apos;s</span>
              </Link>
            </li>
            <li>
              <Link href="/login" onClick={onCloseMobile}>
                <i className="fa-sharp fa-regular fa-shopping-bag" />
                <span>Log In</span>
              </Link>
            </li>
            <li>
              <Link href="/reset-password" onClick={onCloseMobile}>
                <i className="fa-sharp fa-regular fa-users" />
                <span>Reset Password</span>
              </Link>
            </li>
          </ul>
          {session?.user ? (
            <button
              type="button"
              className="single-menu intellect-sidebar-button"
              onClick={() => {
                void signOut({ callbackUrl: "/login" });
              }}
            >
              <div className="icon">
                <img src="/intellect/images/icons/09.png" alt="" />
              </div>
              <p>Logout</p>
            </button>
          ) : (
            <Link href="/login" className="single-menu" onClick={onCloseMobile}>
              <div className="icon">
                <img src="/intellect/images/icons/09.png" alt="" />
              </div>
              <p>Login</p>
            </Link>
          )}
        </div>
      </div>
      <div className="bottom-user">
        <div className="user-wrapper">
          <BrandAvatar
            kind={session?.user ? "user" : "brand"}
            label={session?.user?.name || "RafayGen"}
            size="md"
            compact
          />
          <div className="info">
            <h6 className="title">{displayName}</h6>
            <Link href={session?.user?.email ? `mailto:${session.user.email}` : "/login"}>
              {displayEmail}
            </Link>
          </div>
          <span>{planLabel((session?.user as { role?: string } | undefined)?.role)}</span>
        </div>
        <div className="pro-upgrade">
          <Link href="/manage-subscription" className="rts-btn btn-primary">
            <img src="/intellect/images/icons/14.png" alt="" />
            View Plans
          </Link>
        </div>
      </div>
    </div>
  );
}

function ShellTopbar({
  collapsed,
  mobileOpen,
  onToggleSidebar,
}: {
  collapsed: boolean;
  mobileOpen: boolean;
  onToggleSidebar: () => void;
}) {
  const { data: session } = useSession();
  const displayName = session?.user?.name || "RafayGen Workspace";
  const displayEmail = session?.user?.email || "Sign in to access saved chats and media jobs";
  const [searchOpen, setSearchOpen] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [languageOpen, setLanguageOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  const closeTopbarMenus = () => {
    setSearchOpen(false);
    setNotificationOpen(false);
    setLanguageOpen(false);
    setProfileOpen(false);
  };

  return (
    <div className="header-area-one">
      <div className="container-30">
        <div className="header-inner-one">
          <div className="left-logo-area">
            <RafaygenLogo variant="lockup" size="md" href="/" className="intellect-shell-lockup" />
            <button
              type="button"
              onClick={onToggleSidebar}
              className={cx(
                "left-side-open-clouse intellect-sidebar-toggle",
                collapsed && "collapsed",
                mobileOpen && "mobile-open",
              )}
              aria-label="Toggle sidebar"
              aria-expanded={mobileOpen}
            >
              <img src="/intellect/images/icons/01.svg" alt="" />
            </button>
          </div>
          <div className="header-right">
            <div className="button-area">
              <Link href="/manage-subscription" className="rts-btn btn-primary">
                <img src="/intellect/images/icons/02.svg" alt="" />
                Plans
              </Link>
            </div>
            <div className="action-interactive-area__header">
              <div className="single_action__haeader search-action openuptip">
                <button
                  type="button"
                  className="intellect-icon-button"
                  onClick={() => {
                    setSearchOpen((prev) => {
                      const next = !prev;
                      if (next) {
                        setNotificationOpen(false);
                        setLanguageOpen(false);
                        setProfileOpen(false);
                      }
                      return next;
                    });
                  }}
                  aria-label="Toggle search"
                >
                  <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
                    <path
                      d="M18.1247 17.2413L13.4046 12.5213C14.5388 11.1596 15.1044 9.41313 14.9837 7.6451C14.863 5.87707 14.0653 4.22363 12.7566 3.02875C11.4479 1.83388 9.72885 1.18955 7.95716 1.22981C6.18548 1.27007 4.49752 1.99182 3.24442 3.24491C1.99133 4.498 1.26958 6.18597 1.22932 7.95765C1.18906 9.72934 1.83339 11.4483 3.02827 12.7571C4.22315 14.0658 5.87658 14.8635 7.64461 14.9842C9.41264 15.1049 11.1591 14.5393 12.5208 13.4051L17.2408 18.1251L18.1247 17.2413Z"
                      fill="#083A5E"
                    />
                  </svg>
                </button>
                <div className="search-opoup slide-down__click" style={{ display: searchOpen ? "block" : "none" }}>
                  <Link href="/chatbot" className="intellect-search-shortcut">
                    Open AI chat
                  </Link>
                  <Link href="/image-generator" className="intellect-search-shortcut">
                    Open image studio
                  </Link>
                  <Link href="/docs" className="intellect-search-shortcut">
                    View documentation
                  </Link>
                </div>
              </div>

              <div className="single_action__haeader notification openuptip">
                <button
                  type="button"
                  className="intellect-icon-button"
                  onClick={() => {
                    setNotificationOpen((prev) => {
                      const next = !prev;
                      if (next) {
                        setSearchOpen(false);
                        setLanguageOpen(false);
                        setProfileOpen(false);
                      }
                      return next;
                    });
                  }}
                  aria-label="Toggle notifications"
                >
                  <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
                    <path
                      d="M16.25 8.75V10.3662L17.9419 12.0581C18.0591 12.1753 18.125 12.3343 18.125 12.5V14.375C18.125 14.5408 18.0592 14.6997 17.9419 14.8169C17.8247 14.9342 17.6658 15 17.5 15H2.5C2.33424 15 2.17527 14.9342 2.05806 14.8169C1.94085 14.6997 1.875 14.5408 1.875 14.375V12.5C1.87504 12.3343 1.94091 12.1753 2.05812 12.0581L3.75 10.3662V8.125C3.75201 6.57622 4.32822 5.08319 5.36721 3.93462C6.4062 2.78605 7.83417 2.06352 9.375 1.90675V0.625H10.625V1.90675C13.7836 2.22978 16.2481 4.88111 16.25 8.125V8.75Z"
                      fill="#083A5E"
                    />
                  </svg>
                </button>
                <div
                  className="notification_main_wrapper slide-down__click"
                  style={{ display: notificationOpen ? "block" : "none" }}
                >
                  <h3 className="title">
                    Notification<span className="count">3</span>
                  </h3>
                  <div className="notification__content">
                    <ul className="notification__items">
                      <li className="single__items">
                        <Link className="single-link" href="/manage-subscription">
                          <div className="avatar">
                            <BrandAvatar kind="brand" label="Billing" size="sm" compact />
                          </div>
                          <div className="main-content">
                            <h5 className="name-user">
                              Billing
                              <span className="time-ago">Now</span>
                            </h5>
                            <div className="disc">Upgrade plans and billing controls live here.</div>
                          </div>
                        </Link>
                      </li>
                      <li className="single__items">
                        <Link className="single-link" href="/docs">
                          <div className="avatar">
                            <BrandAvatar kind="brand" label="Docs" size="sm" compact />
                          </div>
                          <div className="main-content">
                            <h5 className="name-user">
                              Docs
                              <span className="time-ago">Guide</span>
                            </h5>
                            <div className="disc">Architecture and monetization docs updated.</div>
                          </div>
                        </Link>
                      </li>
                      <li className="single__items">
                        <Link className="single-link" href="/community-feed">
                          <div className="avatar">
                            <BrandAvatar kind="brand" label="Feed" size="sm" compact />
                          </div>
                          <div className="main-content">
                            <h5 className="name-user">
                              Feed
                              <span className="time-ago">Live</span>
                            </h5>
                            <div className="disc">Knowledge feed pages and content previews are live.</div>
                          </div>
                        </Link>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>

              <div className="single_action__haeader language user_avatar__information openuptip">
                <button
                  type="button"
                  className="intellect-icon-button"
                  onClick={() => {
                    setLanguageOpen((prev) => {
                      const next = !prev;
                      if (next) {
                        setSearchOpen(false);
                        setNotificationOpen(false);
                        setProfileOpen(false);
                      }
                      return next;
                    });
                  }}
                  aria-label="Toggle languages"
                >
                  <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
                    <path
                      d="M11.25 3.125V4.375H9.25C8.83816 6.14196 7.99661 7.77997 6.8 9.14375C7.70414 10.0661 8.79525 10.7843 10 11.25L9.55625 12.4C8.20367 11.8567 6.97802 11.0396 5.95625 10C4.9156 11.0255 3.68974 11.8442 2.34375 12.4125L1.875 11.25C3.07285 10.7429 4.16632 10.0182 5.1 9.1125C4.2552 8.08229 3.61842 6.89788 3.225 5.625H4.5375C4.85587 6.57383 5.3405 7.45844 5.96875 8.2375C6.93251 7.12787 7.6162 5.80335 7.9625 4.375H1.25V3.125H5.625V1.25H6.875V3.125H11.25Z"
                      fill="#083A5E"
                    />
                  </svg>
                </button>
                <div
                  className="user_information_main_wrapper slide-down__click language-area"
                  style={{ display: languageOpen ? "block" : "none" }}
                >
                  <ul className="select-language-area">
                    <li>
                      <Link href="/chatbot">English</Link>
                    </li>
                    <li>
                      <Link href="/voicegenerator">Urdu</Link>
                    </li>
                    <li>
                      <Link href="/voicegenerator">Hindi</Link>
                    </li>
                  </ul>
                </div>
              </div>

              <div className="single_action__haeader rts-dark-light openuptip">
                <ThemeModeToggle />
              </div>

              <div className="single_action__haeader user_avatar__information openuptip">
                <button
                  type="button"
                  className="avatar intellect-avatar-button"
                  onClick={() => {
                    setProfileOpen((prev) => {
                      const next = !prev;
                      if (next) {
                        setSearchOpen(false);
                        setNotificationOpen(false);
                        setLanguageOpen(false);
                      }
                      return next;
                    });
                  }}
                >
                  <BrandAvatar
                    kind={session?.user ? "user" : "brand"}
                    label={session?.user?.name || "RG"}
                    size="sm"
                    compact
                  />
                </button>
                <div
                  style={{ display: profileOpen ? "block" : "none" }}
                  className="user_information_main_wrapper slide-down__click"
                >
                  <div className="user_header">
                    <div className="main-avatar">
                      <BrandAvatar
                        kind={session?.user ? "user" : "brand"}
                        label={session?.user?.name || "RafayGen"}
                        size="lg"
                        compact
                      />
                    </div>
                    <div className="user_naim-information">
                      <h3 className="title">{displayName}</h3>
                      <span className="desig">{displayEmail}</span>
                    </div>
                  </div>
                  <div className="user_body_content">
                    <ul className="items">
                      <li className="single_items">
                        <Link className="hader_popup_link" href="/docs">
                          <i className="fa-light fa-user" />
                          Documentation
                        </Link>
                      </li>
                      <li className="single_items">
                        <Link className="hader_popup_link" href="/manage-subscription">
                          <i className="fa-regular fa-gear" />
                          Billing
                        </Link>
                      </li>
                      <li className="single_items">
                        <Link className="hader_popup_link" href="/contact">
                          <i className="fa-light fa-person-snowmobiling" />
                          Support
                        </Link>
                      </li>
                      {session?.user ? (
                        <li className="single_items">
                          <button
                            type="button"
                            className="hader_popup_link intellect-profile-action"
                            onClick={() => {
                              void signOut({ callbackUrl: "/login" });
                            }}
                          >
                            <i className="fa-light fa-arrow-right-from-bracket" />
                            Logout
                          </button>
                        </li>
                      ) : (
                        <li className="single_items">
                          <Link className="hader_popup_link" href="/login">
                            <i className="fa-light fa-arrow-right-to-bracket" />
                            Login
                          </Link>
                        </li>
                      )}
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function IntellectShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() || "/";
  const mode = useMemo(() => getShellMode(pathname), [pathname]);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === "1";
  });
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, sidebarCollapsed ? "1" : "0");
  }, [sidebarCollapsed]);

  useEffect(() => {
    setMobileSidebarOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleResize = () => {
      if (window.innerWidth > 1199) {
        setMobileSidebarOpen(false);
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const effectiveSettingsOpen =
    settingsOpen || matchPath(pathname, "/faq") || matchPath(pathname, "/reset-password");

  useEffect(() => {
    const classes = routeBodyClasses(pathname, mode);
    const managedClasses = [
      "intellect-template-active",
      "register",
      "page-login",
      "community-feed",
      "chatbot",
    ];
    document.body.classList.remove(...managedClasses);
    if (mode !== "excluded") {
      document.body.classList.add(...classes);
    }
    return () => {
      document.body.classList.remove(...managedClasses);
    };
  }, [pathname, mode]);

  if (mode === "excluded") {
    return <>{children}</>;
  }

  const value: ShellContextValue = { sidebarCollapsed };

  if (mode === "auth") {
    return <IntellectShellContext.Provider value={value}>{children}</IntellectShellContext.Provider>;
  }

  const toggleSidebar = () => {
    if (typeof window !== "undefined" && window.innerWidth <= 1199) {
      setMobileSidebarOpen((prev) => !prev);
      return;
    }
    setSidebarCollapsed((prev) => !prev);
  };

  const shellSidebarCollapsed = sidebarCollapsed && !mobileSidebarOpen;

  return (
    <IntellectShellContext.Provider value={value}>
      <div className="intellect-template-stage">
        <ShellTopbar
          collapsed={shellSidebarCollapsed}
          mobileOpen={mobileSidebarOpen}
          onToggleSidebar={toggleSidebar}
        />
        <div className="dash-board-main-wrapper">
          <ShellSidebar
            pathname={pathname}
            collapsed={shellSidebarCollapsed}
            mobileOpen={mobileSidebarOpen}
            onCloseMobile={() => setMobileSidebarOpen(false)}
            settingsOpen={effectiveSettingsOpen}
            onToggleSettings={() => setSettingsOpen((prev) => !prev)}
          />
          {children}
        </div>
      </div>
    </IntellectShellContext.Provider>
  );
}
