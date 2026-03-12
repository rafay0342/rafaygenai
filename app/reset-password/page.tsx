"use client";

import Link from "next/link";
import { signIn } from "next-auth/react";
import { useEffect, useState } from "react";

export default function ResetPasswordPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [emailEnabled, setEmailEnabled] = useState(false);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const response = await fetch("/api/auth/providers");
        const payload = (await response.json()) as Record<string, unknown>;
        if (!mounted) return;
        setEmailEnabled(Boolean(payload?.email));
      } catch {
        if (mounted) setEmailEnabled(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setStatus(null);

    if (!emailEnabled) {
      setError("Password reset is not configured. Use login providers instead.");
      return;
    }
    if (!email.trim()) {
      setError("Enter your email.");
      return;
    }

    await signIn("email", {
      email: email.trim(),
      redirect: false,
      callbackUrl: "/login",
    });
    setStatus("Magic sign-in link sent. Use it to access your account securely.");
  };

  return (
    <div className="dash-board-main-wrapper pt--10 intellect-auth-page">
      <div className="main-center-content-m-left center-content">
        <div className="rts-register-area">
          <div className="container">
            <div className="row">
              <div className="col-lg-12">
                <div className="single-form-s-wrapper reset text-start ptb--150 ptb_sm--50">
                  <div className="head">
                    <h5 className="title">Recover account access</h5>
                    <p className="mb--20">
                      Password reset is handled with a secure email access link when direct reset is not configured.
                    </p>
                  </div>
                  <div className="body">
                    <form onSubmit={handleSubmit}>
                      <div className="input-wrapper">
                        <input type="email" placeholder="Email address" value={email} onChange={(event) => setEmail(event.target.value)} required />
                      </div>
                      <button type="submit" className="rts-btn btn-primary">
                        Send Access Link
                      </button>
                      {status ? <p className="mt--20 text-success">{status}</p> : null}
                      {error ? <p className="mt--20 text-danger">{error}</p> : null}
                      <p>
                        <Link href="/login">
                          <i className="fa-solid fa-arrow-left" /> Back to Login
                        </Link>
                      </p>
                    </form>
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
