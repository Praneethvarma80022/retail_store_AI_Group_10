import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useState } from "react";
import { useAuth } from "../context/useAuth";

const navigation = [
  {
    label: "Dashboard",
    path: "/",
  },
  {
    label: "Inventory",
    path: "/store",
  },
  {
    label: "Sales",
    path: "/sales",
  },
  {
    label: "Forecasting",
    path: "/forecasting",
  },
  {
    label: "Recommendations",
    path: "/recommendations",
  },
  {
    label: "Customer Care",
    path: "/customer-service",
  },
  {
    label: "Assistant",
    path: "/assistant",
  },
];

const routeCopy = {
  "/": {
    title: "Dashboard",
  },
  "/store": {
    title: "Inventory",
  },
  "/sales": {
    title: "Sales",
  },
  "/forecasting": {
    title: "Forecasting",
  },
  "/recommendations": {
    title: "Recommendations",
  },
  "/customer-service": {
    title: "Customer Care",
  },
  "/assistant": {
    title: "Chatbot",
  },
};

function resolveCopy(pathname) {
  if (pathname.startsWith("/store")) return routeCopy["/store"];
  if (pathname.startsWith("/sales")) return routeCopy["/sales"];
  if (pathname.startsWith("/forecasting")) return routeCopy["/forecasting"];
  if (pathname.startsWith("/recommendations")) return routeCopy["/recommendations"];
  if (pathname.startsWith("/customer-service")) return routeCopy["/customer-service"];
  if (pathname.startsWith("/assistant")) return routeCopy["/assistant"];
  return routeCopy["/"];
}

export default function AppShell() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();
  const { signOut, user } = useAuth();
  const copy = resolveCopy(location.pathname);
  const dateLabel = new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date());

  return (
    <div className="app-shell">
      <div className="backdrop-glow backdrop-glow-a" />
      <div className="backdrop-glow backdrop-glow-b" />

      <aside className="sidebar card-surface">
        <div className="brand-lockup">
          <div className="brand-mark">
            <span />
            <span />
            <span />
          </div>
          <div>
            <h1 className="brand-title">Retail AI</h1>
          </div>
        </div>

        <nav className="nav-list" aria-label="Primary navigation">
          {navigation.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === "/"}
              className={({ isActive }) =>
                `nav-item${isActive ? " is-active" : ""}`
              }
              onClick={() => setMobileMenuOpen(false)}
            >
              <span className="nav-label">{item.label}</span>
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <div className="mobile-menu-overlay" onClick={() => setMobileMenuOpen(false)}>
          <div className="mobile-menu-panel" onClick={(e) => e.stopPropagation()}>
            <button
              className="mobile-menu-close"
              onClick={() => setMobileMenuOpen(false)}
            >
              ✕
            </button>
            <h3 className="mobile-menu-title">Menu</h3>
            <nav className="mobile-menu-list">
              {navigation.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  end={item.path === "/"}
                  className={({ isActive }) =>
                    `mobile-menu-item${isActive ? " is-active" : ""}`
                  }
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </div>
        </div>
      )}

      <div className="main-column">
        <header className="topbar card-surface">
          {/* Mobile Menu Button */}
          <button
            className="mobile-menu-btn"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle menu"
            title="Open Menu"
          >
            <span></span>
            <span></span>
            <span></span>
          </button>

          <div>
            <h2 className="page-title">{copy.title}</h2>
          </div>

          <div className="topbar-meta">
            {user ? (
              <span className="meta-pill user-pill">
                {user.picture ? <img src={user.picture} alt="" /> : null}
                {user.name || user.email}
              </span>
            ) : null}
            {user?.workspaceName ? (
              <span className="meta-pill">{user.workspaceName}</span>
            ) : null}
            {user?.role ? (
              <span className="meta-pill meta-pill-strong">
                {user.role === "admin" ? "Admin" : "Member"}
              </span>
            ) : null}
            <span className="meta-pill">{dateLabel}</span>
            <button type="button" className="button button-secondary" onClick={signOut}>
              Sign out
            </button>
          </div>
        </header>

        <main className="page-shell">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
