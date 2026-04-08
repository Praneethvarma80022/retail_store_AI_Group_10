import { useEffect, useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";

import { useAuth } from "../context/useAuth";
import api, { getErrorMessage } from "../lib/api";
import "./LoginPage.css";

// Demo Credentials
const DEMO_CREDENTIALS = {
  email: "demo@retail.ai",
  password: "Demo@123",
  name: "Demo User"
};

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

  // Form states
  const [mode, setMode] = useState("login"); // "login", "register", "totp-setup", "totp-verify", "totp-setup-registration"
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    name: "",
    totpToken: "",
    totpBackupCode: ""
  });
  const [totpSetupData, setTotpSetupData] = useState(null);
  const [tempToken, setTempToken] = useState(null);
  const [showBackupCodes, setShowBackupCodes] = useState(false);
  const [copiedBackupCode, setCopiedBackupCode] = useState(null);
  const [registrationEmail, setRegistrationEmail] = useState("");
  const [showDemoCode, setShowDemoCode] = useState(false);

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
          setError(getErrorMessage(requestError, "Unable to load configuration."));
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
    if (!config?.googleClientId || !googleButtonRef.current || mode !== "login") {
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
          }
        });

        window.google.accounts.id.renderButton(googleButtonRef.current, {
          theme: "outline",
          size: "large"
        });
      } catch (setupError) {
        if (!cancelled) {
          setError(getErrorMessage(setupError, "Unable to load Google sign-in."));
        }
      }
    }

    renderGoogleButton();

    return () => {
      cancelled = true;
    };
  }, [config, mode, navigate, signIn]);

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value
    }));
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setError("");
    setSigningIn(true);

    try {
      if (!formData.email || !formData.password || !formData.name) {
        throw new Error("All fields are required.");
      }

      // Step 1: Create the account
      const registerResponse = await api.post("/auth/register", {
        email: formData.email,
        password: formData.password,
        name: formData.name
      });

      console.log("Account created successfully");

      // Step 2: Set up TOTP with the new account's token
      const totpResponse = await api.post("/auth/totp/setup", {}, {
        headers: {
          Authorization: `Bearer ${registerResponse.data.token}`
        }
      });

      console.log("TOTP setup initiated - showing QR code");

      // Store data for TOTP verification
      setTempToken(registerResponse.data.token);
      setRegistrationEmail(formData.email);
      setTotpSetupData(totpResponse.data);
      setMode("totp-setup-registration");
      
      // Clear TOTP input fields
      setFormData((prev) => ({
        ...prev,
        totpToken: "",
        totpBackupCode: ""
      }));

    } catch (requestError) {
      setError(getErrorMessage(requestError, "Registration failed."));
    } finally {
      setSigningIn(false);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setSigningIn(true);

    try {
      if (!formData.email || !formData.password) {
        throw new Error("Email and password are required.");
      }

      const response = await api.post("/auth/login", {
        email: formData.email,
        password: formData.password
      });

      console.log("Login response:", response.data);
      
      if (response.data.requiresTOTP) {
        console.log("TOTP required - showing verification screen");
        setTempToken(response.data.tempToken);
        // Keep the email in formData for TOTP verification
        setFormData((prev) => ({
          email: prev.email, // Preserve email for TOTP verification
          password: prev.password,
          name: prev.name,
          totpToken: "",
          totpBackupCode: ""
        }));
        setMode("totp-verify");
      } else {
        console.log("No TOTP required - logging in directly");
        signIn(response.data);
        navigate("/", { replace: true });
      }
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Login failed."));
    } finally {
      setSigningIn(false);
    }
  };

  const handleSetupTOTP = async (e) => {
    e.preventDefault();
    setError("");
    setSigningIn(true);

    try {
      const response = await api.post("/auth/totp/setup", {}, {
        headers: {
          Authorization: `Bearer ${tempToken}`
        }
      });

      setTotpSetupData(response.data);
      setMode("totp-setup");
    } catch (requestError) {
      setError(getErrorMessage(requestError, "TOTP setup failed."));
    } finally {
      setSigningIn(false);
    }
  };

  const handleVerifyTOTPSetup = async (e) => {
    e.preventDefault();
    setError("");
    setSigningIn(true);

    try {
      if (!formData.totpToken) {
        throw new Error("TOTP token is required.");
      }

      await api.post("/auth/totp/verify", {
        token: formData.totpToken
      }, {
        headers: {
          Authorization: `Bearer ${tempToken}`
        }
      });

      // Get the full session after TOTP verification
      const userResponse = await api.get("/auth/me", {
        headers: {
          Authorization: `Bearer ${tempToken}`
        }
      });

      signIn({
        token: tempToken,
        user: userResponse.data.user
      });

      navigate("/", { replace: true });
    } catch (requestError) {
      setError(getErrorMessage(requestError, "TOTP verification failed."));
    } finally {
      setSigningIn(false);
    }
  };

  const handleVerifyTOTPRegistration = async (e) => {
    e.preventDefault();
    setError("");
    setSigningIn(true);

    try {
      if (!formData.totpToken) {
        throw new Error("TOTP token is required.");
      }

      console.log("Verifying TOTP for registration");

      // Verify the TOTP token
      await api.post("/auth/totp/verify", {
        token: formData.totpToken
      }, {
        headers: {
          Authorization: `Bearer ${tempToken}`
        }
      });

      console.log("TOTP verified - registration complete");

      // Get user info and complete registration
      const userResponse = await api.get("/auth/me", {
        headers: {
          Authorization: `Bearer ${tempToken}`
        }
      });

      // Sign in the new user
      signIn({
        token: tempToken,
        user: userResponse.data.user
      });

      navigate("/", { replace: true });
    } catch (requestError) {
      setError(getErrorMessage(requestError, "TOTP verification failed. Please try again."));
    } finally {
      setSigningIn(false);
    }
  };

  const handleVerifyTOTPLogin = async (e) => {
    e.preventDefault();
    setError("");
    setSigningIn(true);

    try {
      if (!formData.totpToken && !formData.totpBackupCode) {
        throw new Error("TOTP token or backup code is required.");
      }

      const response = await api.post("/auth/totp/verify-login", {
        email: formData.email,
        token: formData.totpToken || formData.totpBackupCode
      });

      signIn(response.data);
      navigate("/", { replace: true });
    } catch (requestError) {
      setError(getErrorMessage(requestError, "TOTP verification failed."));
    } finally {
      setSigningIn(false);
    }
  };

  const copyBackupCode = (code) => {
    navigator.clipboard.writeText(code);
    setCopiedBackupCode(code);
    setTimeout(() => setCopiedBackupCode(null), 2000);
  };

  const handleDemoLogin = async (e) => {
    e.preventDefault();
    setError("");
    setSigningIn(true);

    try {
      // Demo login without backend - create a mock session
      const demoSession = {
        token: "demo-token-" + Date.now() + "-" + Math.random().toString(36).substr(2, 9),
        user: {
          id: "demo-user-001",
          email: DEMO_CREDENTIALS.email,
          name: DEMO_CREDENTIALS.name,
          role: "admin",
          createdAt: new Date().toISOString(),
          isDemo: true
        }
      };

      signIn(demoSession);
      navigate("/", { replace: true });
    } catch (error) {
      setError("Demo login failed. Please try again.");
    } finally {
      setSigningIn(false);
    }
  };

  if (loading) {
    return (
      <div className="login-page">
        <div className="login-container">
          <div className="login-card">
            <div className="login-header">
              <h1 className="login-title">Loading...</h1>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (user) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="login-page">
      <div className="login-container">
        <div className="login-card">
          <div className="login-header">
            <h1 className="login-title">Retail Intelligence</h1>
            <p className="login-subtitle">Secure Authentication</p>
          </div>

          {error && (
            <div className="alert alert-error">
              {error}
            </div>
          )}

          {/* Login Form */}
          {mode === "login" && (
            <div>
              <form onSubmit={handleLogin} className="login-form">
                <div className="form-group">
                  <label className="form-label">Email</label>
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleFormChange}
                    className="form-input"
                    placeholder="your@email.com"
                    disabled={signingIn}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Password</label>
                  <input
                    type="password"
                    name="password"
                    value={formData.password}
                    onChange={handleFormChange}
                    className="form-input"
                    placeholder="••••••••"
                    disabled={signingIn}
                  />
                </div>

                <button
                  type="submit"
                  disabled={signingIn}
                  className="btn btn-primary"
                >
                  {signingIn ? (
                    <>
                      <span className="loading-spinner"></span>
                      Signing in...
                    </>
                  ) : (
                    "Sign In"
                  )}
                </button>
              </form>

              <div className="divider-container">
                <div className="divider-line"></div>
                <span className="divider-text">Or</span>
                <div className="divider-line"></div>
              </div>

              <div className="divider-container">
                <div className="divider-line"></div>
                <span className="divider-text">Or</span>
                <div className="divider-line"></div>
              </div>

              <div ref={googleButtonRef} className="google-button-container"></div>

              <div className="divider-container">
                <div className="divider-line"></div>
                <span className="divider-text">Demo Login</span>
                <div className="divider-line"></div>
              </div>

              <div className="demo-login-section">
                <div className="demo-credentials-box">
                  <p className="demo-label">📋 Demo Credentials</p>
                  <div className="demo-credential-item">
                    <span className="demo-key">Email:</span>
                    <span className="demo-value">{DEMO_CREDENTIALS.email}</span>
                  </div>
                  <div className="demo-credential-item">
                    <span className="demo-key">Password:</span>
                    <span className="demo-value">{DEMO_CREDENTIALS.password}</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleDemoLogin}
                    disabled={signingIn}
                    className="btn btn-demo"
                  >
                    {signingIn ? (
                      <>
                        <span className="loading-spinner"></span>
                        Demo Login...
                      </>
                    ) : (
                      "🚀 Quick Demo Login"
                    )}
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setShowDemoCode(!showDemoCode)}
                  className="demo-code-toggle"
                >
                  {showDemoCode ? "Hide" : "Show"} Demo Authentication Code
                </button>

                {showDemoCode && (
                  <div className="demo-code-section">
                    <p className="demo-code-title">Authentication Code Snippet:</p>
                    <pre className="demo-code-block">{`// Demo Login Handler - No Backend Required
const handleDemoLogin = async (e) => {
  e.preventDefault();
  
  // Create a mock session without backend calls
  const demoSession = {
    token: "demo-token-" + Date.now(),
    user: {
      id: "demo-user-001",
      email: "${DEMO_CREDENTIALS.email}",
      name: "${DEMO_CREDENTIALS.name}",
      role: "admin",
      isDemo: true
    }
  };
  
  // Sign in with demo session
  signIn(demoSession);
  navigate("/", { replace: true });
};

// Usage Example:
// <button onClick={handleDemoLogin}>
//   Demo Login
// </button>`}</pre>
                    <button
                      type="button"
                      onClick={() => {
                        const codeText = `// Demo Login Handler - No Backend Required
const handleDemoLogin = async (e) => {
  e.preventDefault();
  
  // Create a mock session without backend calls
  const demoSession = {
    token: "demo-token-" + Date.now(),
    user: {
      id: "demo-user-001",
      email: "${DEMO_CREDENTIALS.email}",
      name: "${DEMO_CREDENTIALS.name}",
      role: "admin",
      isDemo: true
    }
  };
  
  // Sign in with demo session
  signIn(demoSession);
  navigate("/", { replace: true });
};`;
                        navigator.clipboard.writeText(codeText);
                        alert("Code copied to clipboard!");
                      }}
                      className="demo-copy-btn"
                    >
                      📋 Copy Code
                    </button>
                  </div>
                )}
              </div>

              <div className="auth-switch">
                <p className="auth-switch-text">
                  Don't have an account?{" "}
                  <button
                    onClick={() => {
                      setMode("register");
                      setError("");
                      setFormData({
                        email: "",
                        password: "",
                        name: "",
                        totpToken: "",
                        totpBackupCode: ""
                      });
                    }}
                    className="form-switch-link"
                  >
                    Register
                  </button>
                </p>
              </div>
            </div>
          )}

          {/* Registration Form */}
          {mode === "register" && (
            <div>
              <form onSubmit={handleRegister} className="login-form">
                <div className="form-group">
                  <label className="form-label">Full Name</label>
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleFormChange}
                    className="form-input"
                    placeholder="John Doe"
                    disabled={signingIn}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Email</label>
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleFormChange}
                    className="form-input"
                    placeholder="your@email.com"
                    disabled={signingIn}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Password</label>
                  <input
                    type="password"
                    name="password"
                    value={formData.password}
                    onChange={handleFormChange}
                    className="form-input"
                    placeholder="••••••••"
                    disabled={signingIn}
                  />
                  <span className="form-hint">Minimum 8 characters</span>
                </div>

                <button
                  type="submit"
                  disabled={signingIn}
                  className="btn btn-success"
                >
                  {signingIn ? (
                    <>
                      <span className="loading-spinner"></span>
                      Creating account...
                    </>
                  ) : (
                    "Create Account"
                  )}
                </button>
              </form>

              <div className="auth-switch">
                <p className="auth-switch-text">
                  Already have an account?{" "}
                  <button
                    onClick={() => {
                      setMode("login");
                      setError("");
                      setFormData({
                        email: "",
                        password: "",
                        name: "",
                        totpToken: "",
                        totpBackupCode: ""
                      });
                    }}
                    className="form-switch-link"
                  >
                    Sign In
                  </button>
                </p>
              </div>
            </div>
          )}

          {/* TOTP Setup During Registration */}
          {mode === "totp-setup-registration" && totpSetupData && (
            <div>
              <h2 style={{ fontSize: "1.25rem", fontWeight: 600, marginBottom: "0.5rem", color: "var(--text-primary)" }}>
                Complete Your Registration
              </h2>
              <p style={{ color: "var(--text-secondary)", marginBottom: "1.5rem", fontSize: "0.875rem" }}>
                Set up two-factor authentication to secure your account
              </p>

              <div className="qr-container">
                <p className="qr-title">Step 1: Scan QR Code with Authenticator App</p>
                <img
                  src={totpSetupData.qrCode}
                  alt="TOTP QR Code"
                  className="qr-image"
                />
                <div className="qr-manual">
                  <p style={{ fontSize: "0.875rem", color: "var(--text-secondary)" }}>Can't scan? Enter manually:</p>
                  <div className="qr-code-text">{totpSetupData.secret}</div>
                </div>
              </div>

              <div className="backup-codes-container">
                <p className="backup-codes-title">Step 2: Save Your Backup Codes</p>
                <p style={{ fontSize: "0.875rem", color: "var(--text-secondary)", marginBottom: "1rem" }}>
                  Save these codes safely. Use them to access your account if you lose your authenticator device.
                </p>
                <div>
                  {totpSetupData.backupCodes.map((code, index) => (
                    <div key={index} className="backup-code-item">
                      <code>{code}</code>
                      <button
                        type="button"
                        onClick={() => copyBackupCode(code)}
                        className="backup-code-copy-btn"
                      >
                        {copiedBackupCode === code ? "✓ Copied" : "Copy"}
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <form onSubmit={handleVerifyTOTPRegistration} className="login-form">
                <div className="form-group">
                  <label className="form-label">Step 3: Enter 6-digit code from your authenticator app</label>
                  <input
                    type="text"
                    name="totpToken"
                    value={formData.totpToken}
                    onChange={handleFormChange}
                    maxLength="6"
                    pattern="[0-9]{6}"
                    className="form-input totp-input"
                    placeholder="000000"
                    disabled={signingIn}
                    autoFocus
                  />
                  <span className="form-hint">Enter the 6-digit code to complete registration</span>
                </div>

                <button
                  type="submit"
                  disabled={signingIn || formData.totpToken.length !== 6}
                  className="btn btn-success"
                  style={{ width: "100%" }}
                >
                  {signingIn ? (
                    <>
                      <span className="loading-spinner"></span>
                      Completing Registration...
                    </>
                  ) : (
                    "Complete Registration"
                  )}
                </button>
              </form>

              <div className="auth-switch">
                <p className="auth-switch-text">
                  <button
                    onClick={() => {
                      setMode("register");
                      setError("");
                      setFormData({
                        email: "",
                        password: "",
                        name: "",
                        totpToken: "",
                        totpBackupCode: ""
                      });
                      setTotpSetupData(null);
                      setTempToken(null);
                    }}
                    className="form-switch-link"
                  >
                    ← Back to Registration
                  </button>
                </p>
              </div>
            </div>
          )}

          {/* TOTP Setup */}
          {mode === "totp-setup" && totpSetupData && (
            <div>
              <h2 style={{ fontSize: "1.25rem", fontWeight: 600, marginBottom: "1.5rem", color: "var(--text-primary)" }}>
                Set Up Two-Factor Authentication
              </h2>

              <div className="qr-container">
                <p className="qr-title">Scan this QR code with your authenticator app:</p>
                <img
                  src={totpSetupData.qrCode}
                  alt="TOTP QR Code"
                  className="qr-image"
                />
                <div className="qr-manual">
                  <p>Or enter this code manually:</p>
                  <div className="qr-code-text">{totpSetupData.secret}</div>
                </div>
              </div>

              <div className="backup-codes-container">
                <p className="backup-codes-title">Save Your Backup Codes:</p>
                <div>
                  {totpSetupData.backupCodes.map((code, index) => (
                    <div key={index} className="backup-code-item">
                      <code>{code}</code>
                      <button
                        type="button"
                        onClick={() => copyBackupCode(code)}
                        className="backup-code-copy-btn"
                      >
                        {copiedBackupCode === code ? "✓ Copied" : "Copy"}
                      </button>
                    </div>
                  ))}
                </div>
                <p className="backup-codes-hint">
                  Save these codes in a safe place. Use them to access your account if you lose your authenticator device.
                </p>
              </div>

              <form onSubmit={handleVerifyTOTPSetup} className="login-form">
                <div className="form-group">
                  <label className="form-label">Enter 6-digit code from your authenticator app:</label>
                  <input
                    type="text"
                    name="totpToken"
                    value={formData.totpToken}
                    onChange={handleFormChange}
                    maxLength="6"
                    pattern="[0-9]{6}"
                    className="form-input totp-input"
                    placeholder="000000"
                    disabled={signingIn}
                  />
                </div>

                <button
                  type="submit"
                  disabled={signingIn || formData.totpToken.length !== 6}
                  className="btn btn-primary"
                >
                  {signingIn ? (
                    <>
                      <span className="loading-spinner"></span>
                      Verifying...
                    </>
                  ) : (
                    "Verify & Enable 2FA"
                  )}
                </button>
              </form>
            </div>
          )}

          {/* TOTP Verify during Login */}
          {mode === "totp-verify" && (
            <div>
              <h2 style={{ fontSize: "1.25rem", fontWeight: 600, marginBottom: "1.5rem", color: "var(--text-primary)" }}>
                Two-Factor Authentication
              </h2>
              <p style={{ color: "var(--text-secondary)", marginBottom: "1.5rem", fontSize: "0.875rem" }}>
                Enter the 6-digit code from your authenticator app or use a backup code.
              </p>

              <form onSubmit={handleVerifyTOTPLogin} className="login-form">
                {!showBackupCodes ? (
                  <>
                    <div className="form-group">
                      <label className="form-label">Authenticator Code</label>
                      <input
                        type="text"
                        name="totpToken"
                        value={formData.totpToken}
                        onChange={handleFormChange}
                        maxLength="6"
                        pattern="[0-9]{6}"
                        className="form-input totp-input"
                        placeholder="000000"
                        disabled={signingIn}
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={signingIn || formData.totpToken.length !== 6}
                      className="btn btn-primary"
                    >
                      {signingIn ? (
                        <>
                          <span className="loading-spinner"></span>
                          Verifying...
                        </>
                      ) : (
                        "Verify"
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowBackupCodes(true)}
                      className="btn btn-secondary"
                    >
                      Use Backup Code
                    </button>
                  </>
                ) : (
                  <>
                    <div className="form-group">
                      <label className="form-label">Backup Code</label>
                      <input
                        type="text"
                        name="totpBackupCode"
                        value={formData.totpBackupCode}
                        onChange={handleFormChange}
                        className="form-input"
                        style={{ textTransform: "uppercase", letterSpacing: "0.1em" }}
                        placeholder="XXXXXXXX"
                        disabled={signingIn}
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={signingIn || !formData.totpBackupCode}
                      className="btn btn-primary"
                    >
                      {signingIn ? (
                        <>
                          <span className="loading-spinner"></span>
                          Verifying...
                        </>
                      ) : (
                        "Verify Backup Code"
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setShowBackupCodes(false);
                        setFormData((prev) => ({
                          ...prev,
                          totpBackupCode: ""
                        }));
                      }}
                      className="btn btn-secondary"
                    >
                      Use Authenticator Code
                    </button>
                  </>
                )}
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
