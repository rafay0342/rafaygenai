"use client";

import Link from "next/link";
import { signIn } from "next-auth/react";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";

function RegisterForm() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [agree, setAgree] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!agree) {
      setError("Please accept privacy policy and terms.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        setError(data.error || "Unable to create account.");
        return;
      }

      const next = searchParams.get("next");
      const destination = next && next.startsWith("/") ? next : "/chatbot";
      await signIn("credentials", {
        redirect: true,
        email,
        password,
        callbackUrl: destination,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="dash-board-main-wrapper intellect-auth-page">
      <div className="main-center-content-m-left center-content">
        <div className="rts-register-area">
          <div className="container">
            <div className="row">
              <div className="col-lg-12">
                <div className="single-form-s-wrapper">
                  <div className="head">
                    <span>Create your workspace</span>
                    <h5 className="title">Register for RafayGen AI</h5>
                  </div>
                  <div className="body">
                    <form onSubmit={handleSubmit}>
                      <div className="input-wrapper">
                        <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email address" required />
                        <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Create a password" required />
                        <input type="password" value={confirm} onChange={(event) => setConfirm(event.target.value)} placeholder="Confirm password" required />
                      </div>
                      <div className="check-wrapper">
                        <div className="form-check">
                          <input className="form-check-input" type="checkbox" checked={agree} onChange={(event) => setAgree(event.target.checked)} id="register-terms" />
                          <label className="form-check-label" htmlFor="register-terms">
                            I agree to privacy policy &amp; terms
                          </label>
                        </div>
                      </div>
                      <button className="rts-btn btn-primary" disabled={loading}>
                        {loading ? "Creating..." : "Create Account"}
                      </button>
                      {error ? <p className="mt--20 text-danger">{error}</p> : null}
                      <p>
                        If you have an account? <Link className="ml--5" href="/login">Sign in</Link>
                      </p>
                    </form>
                  </div>
                  <div className="other-separator">
                    <span>Email account setup</span>
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

export default function RegisterPage() {
  return (
    <Suspense fallback={null}>
      <RegisterForm />
    </Suspense>
  );
}
