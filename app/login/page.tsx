"use client";

import Link from "next/link";
import { signIn } from "next-auth/react";
import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

function LoginForm() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [providers, setProviders] = useState<Record<string, unknown>>({});
  const [providersLoading, setProvidersLoading] = useState(true);
  const [phoneModalOpen, setPhoneModalOpen] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [phoneCode, setPhoneCode] = useState("");
  const [phoneStatus, setPhoneStatus] = useState<string | null>(null);
  const emailInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const response = await fetch("/api/auth/providers");
        const payload = (await response.json()) as Record<string, unknown>;
        if (!mounted) return;
        setProviders(payload || {});
      } catch {
        if (mounted) setProviders({});
      } finally {
        if (mounted) setProvidersLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const destination = (() => {
    const next = searchParams.get("next");
    return next && next.startsWith("/") ? next : "/chatbot";
  })();

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    const response = await signIn("credentials", {
      redirect: false,
      email,
      password,
    });

    if (response?.error) {
      setError("Invalid credentials.");
      return;
    }
    window.location.href = destination;
  };

  const handleOAuth = async (providerId: string) => {
    setError(null);
    await signIn(providerId, { callbackUrl: destination });
  };

  const handleEmailLink = async () => {
    setError(null);
    const resolvedEmail = (email || emailInputRef.current?.value || "").trim();
    if (!resolvedEmail) {
      setError("Enter your email to continue.");
      emailInputRef.current?.focus();
      return;
    }
    if (!providers?.email) {
      setError("Email sign-in is not available.");
      return;
    }
    await signIn("email", { email: resolvedEmail, callbackUrl: destination });
  };

  const sendPhoneCode = async () => {
    setPhoneStatus(null);
    const response = await fetch("/api/auth/phone/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: phoneNumber }),
    });
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) {
      setPhoneStatus(data.error || "Unable to send code.");
      return;
    }
    setPhoneStatus("Code sent.");
  };

  const verifyPhoneCode = async () => {
    await signIn("phone", {
      redirect: true,
      phone: phoneNumber,
      otp: phoneCode,
      callbackUrl: destination,
    });
  };

  const googleEnabled = Boolean(providers?.google);
  const facebookEnabled = Boolean(providers?.facebook);
  const appleEnabled = Boolean(providers?.apple);
  const azureEnabled = Boolean(providers?.["azure-ad"]);
  const emailEnabled = providersLoading ? true : Boolean(providers?.email);
  const phoneEnabled = Boolean(providers?.phone);

  return (
    <div className="dash-board-main-wrapper pt--40 intellect-auth-page">
      <div className="main-center-content-m-left center-content">
        <div className="rts-register-area">
          <div className="container">
            <div className="row">
              <div className="col-lg-12">
                <div className="single-form-s-wrapper">
                  <div className="head">
                    <span>Access your workspace</span>
                    <h5 className="title">Sign in to RafayGen AI</h5>
                  </div>
                  <div className="body">
                    <form onSubmit={handleSubmit}>
                      <div className="input-wrapper">
                        <input
                          ref={emailInputRef}
                          type="email"
                          value={email}
                          onChange={(event) => setEmail(event.target.value)}
                          placeholder="Email address"
                          required
                        />
                        <input
                          type="password"
                          value={password}
                          onChange={(event) => setPassword(event.target.value)}
                          placeholder="Password"
                          required
                        />
                      </div>
                      <div className="check-wrapper">
                        <div className="form-check">
                          <input className="form-check-input" type="checkbox" value="" id="remember-login" />
                          <label className="form-check-label" htmlFor="remember-login">
                            Keep me signed in
                          </label>
                        </div>
                        <Link href="/reset-password">Forgot password?</Link>
                      </div>
                      <button type="submit" className="rts-btn btn-primary">
                        Sign In
                      </button>
                      {error ? <p className="mt--20 text-danger">{error}</p> : null}
                      <p>
                        Don&apos;t have an account? <Link className="ml--5" href="/register">Sign Up for Free</Link>
                      </p>
                    </form>
                  </div>
                  <div className="other-separator">
                    <span>or</span>
                  </div>
                  <div className="sign-in-otherway">
                    {azureEnabled ? (
                      <button type="button" className="single intellect-social-action" onClick={() => void handleOAuth("azure-ad")}>
                        <div className="icon">M</div>
                        <p>Continue with Microsoft</p>
                      </button>
                    ) : null}
                    {googleEnabled ? (
                      <button type="button" className="single intellect-social-action" onClick={() => void handleOAuth("google")}>
                        <div className="icon">G</div>
                        <p>Continue with Google</p>
                      </button>
                    ) : null}
                    {facebookEnabled ? (
                      <button type="button" className="single intellect-social-action" onClick={() => void handleOAuth("facebook")}>
                        <div className="icon">f</div>
                        <p>Continue with Facebook</p>
                      </button>
                    ) : null}
                    {appleEnabled ? (
                      <button type="button" className="single intellect-social-action" onClick={() => void handleOAuth("apple")}>
                        <div className="icon"></div>
                        <p>Continue with Apple</p>
                      </button>
                    ) : null}
                    {emailEnabled ? (
                      <button type="button" className="single intellect-social-action" onClick={() => void handleEmailLink()}>
                        <div className="icon">@</div>
                        <p>Continue with Email</p>
                      </button>
                    ) : null}
                    {phoneEnabled ? (
                      <button type="button" className="single intellect-social-action" onClick={() => setPhoneModalOpen(true)}>
                        <div className="icon">#</div>
                        <p>Continue with Phone</p>
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {phoneModalOpen ? (
        <div className="gem-media-overlay" onClick={() => setPhoneModalOpen(false)}>
          <section className="gem-media-modal" onClick={(event) => event.stopPropagation()}>
            <header className="gem-media-modal-head">
              <div>
                <p className="gem-media-kicker">Phone Login</p>
                <h3>Verify your phone</h3>
              </div>
              <button
                type="button"
                className="gem-media-close-btn"
                onClick={() => setPhoneModalOpen(false)}
                aria-label="Close phone login"
              >
                ×
              </button>
            </header>
            <div className="gem-media-modal-body">
              <label className="gem-media-label" htmlFor="phoneNumber">
                Phone (E.164)
              </label>
              <input
                id="phoneNumber"
                className="gem-media-textarea"
                style={{ minHeight: "48px" }}
                placeholder="+1XXXXXXXXXX"
                value={phoneNumber}
                onChange={(event) => setPhoneNumber(event.target.value)}
              />
              <label className="gem-media-label" htmlFor="phoneCode">
                Code
              </label>
              <input
                id="phoneCode"
                className="gem-media-textarea"
                style={{ minHeight: "48px" }}
                placeholder="123456"
                value={phoneCode}
                onChange={(event) => setPhoneCode(event.target.value)}
              />
              {phoneStatus ? <p className="gem-media-hint">{phoneStatus}</p> : null}
            </div>
            <footer className="gem-media-modal-actions">
              <button type="button" className="gem-media-btn ghost" onClick={() => void sendPhoneCode()}>
                Send code
              </button>
              <button type="button" className="gem-media-btn" onClick={() => void verifyPhoneCode()}>
                Verify
              </button>
            </footer>
          </section>
        </div>
      ) : null}
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
