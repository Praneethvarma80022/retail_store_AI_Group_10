import { useEffect, useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";

import { useAuth } from "../context/useAuth";
import api, { getErrorMessage } from "../lib/api";

function loadGoogleScript() {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) {
      resolve();
      return;
    }

    const existingScript = document.querySelector("script[data-google-identity]");

    if (existingScript) {
      existingScript.addEventListener("load", resolve, { once: true });
      existingScript.addEventListener("error", reject, { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.dataset.googleIdentity = "true";
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

export default function LoginPage() {
  const googleButtonRef = useRef(null);
  const navigate = useNavigate();
  const { signIn, user } = useAuth();
  const [config, setConfig] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadConfig() {
      try {
        const response = await api.get("/auth/config");
        if (!cancelled) {
          setConfig(response.data);
        }
      } catch (requestError) {
        if (!cancelled) {
          setError(getErrorMessage(requestError, "Unable to load Google sign-in."));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadConfig();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!config?.googleClientId || !googleButtonRef.current) {
      return;
    }

    let cancelled = false;

    async function renderGoogleButton() {
      try {
        await loadGoogleScript();

        if (cancelled) {
          return;
        }

        window.google.accounts.id.initialize({
          client_id: config.googleClientId,
          callback: async (response) => {
            setSigningIn(true);
            setError("");

            try {
              const sessionResponse = await api.post("/auth/google", {
                credential: response.credential,
              });
              signIn(sessionResponse.data);
              navigate("/", { replace: true });
            } catch (requestError) {
              setError(getErrorMessage(requestError, "Google sign-in failed."));
            } finally {
              setSigningIn(false);
            }
          },
        });

        googleButtonRef.current.innerHTML = "";
        window.google.accounts.id.renderButton(googleButtonRef.current, {
          theme: "outline",
          size: "large",
          shape: "pill",
          text: "continue_with",
          width: 320,
        });
      } catch {
        setError("Google sign-in script could not be loaded.");
      }
    }

    renderGoogleButton();

    return () => {
      cancelled = true;
    };
  }, [config?.googleClientId, navigate, signIn]);

  if (user) {
    return <Navigate to="/" replace />;
  }

  return (
    <main className="auth-page">
      <section className="auth-card card-surface">
        <div className="brand-lockup auth-brand">
          <div className="brand-mark">
            <span />
            <span />
            <span />
          </div>
          <h1 className="brand-title">Retail AI</h1>
        </div>

        <div>
          <h2>Sign in</h2>
          <p>
            Use Google to open your private retail workspace. Your inventory,
            sales, customers, and chatbot data stay separated from every other user.
          </p>
        </div>

        {loading ? <p className="muted-copy">Loading sign-in...</p> : null}

        {!loading && !config?.googleConfigured ? (
          <div className="alert-banner alert-error">
            Google sign-in is not configured. Add GOOGLE_CLIENT_ID to backend/.env.
          </div>
        ) : null}

        {error ? <div className="alert-banner alert-error">{error}</div> : null}

        <div className="google-login-box" ref={googleButtonRef} />

        {signingIn ? <p className="muted-copy">Signing you in...</p> : null}
      </section>
    </main>
  );
}
