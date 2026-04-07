import { useEffect, useMemo, useState } from "react";

import api from "../lib/api";
import {
  clearStoredSession,
  readStoredSession,
  storeSession,
} from "../lib/auth";
import { AuthContext } from "./AuthContextValue";

export function AuthProvider({ children }) {
  const [session, setSession] = useState(() => readStoredSession());
  const [loading, setLoading] = useState(Boolean(readStoredSession()?.token));

  useEffect(() => {
    const current = readStoredSession();

    if (!current?.token) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function validateSession() {
      try {
        const response = await api.get("/auth/me");
        if (!cancelled) {
          const nextSession = {
            token: current.token,
            user: response.data.user,
          };
          setSession(nextSession);
          storeSession(nextSession);
        }
      } catch {
        clearStoredSession();
        if (!cancelled) {
          setSession(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    validateSession();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function handleExpiredSession() {
      setSession(null);
    }

    window.addEventListener("retail-ai-auth-expired", handleExpiredSession);

    return () => {
      window.removeEventListener("retail-ai-auth-expired", handleExpiredSession);
    };
  }, []);

  function signIn(nextSession) {
    storeSession(nextSession);
    setSession(nextSession);
  }

  function signOut() {
    clearStoredSession();
    setSession(null);
  }

  const value = useMemo(
    () => ({
      loading,
      session,
      signIn,
      signOut,
      token: session?.token || "",
      user: session?.user || null,
    }),
    [loading, session]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
