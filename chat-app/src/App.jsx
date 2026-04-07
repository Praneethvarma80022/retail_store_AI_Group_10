import { Navigate, Route, Routes } from "react-router-dom";

import AppShell from "./components/AppShell";
import { useAuth } from "./context/useAuth";
import AssistantPage from "./pages/AssistantPage";
import CustomerServicePage from "./pages/CustomerServicePage";
import DashboardPage from "./pages/DashboardPage";
import ForecastsPage from "./pages/ForecastsPage";
import InventoryPage from "./pages/InventoryPage";
import LoadingState from "./components/LoadingState";
import LoginPage from "./pages/LoginPage";
import RecommendationsPage from "./pages/RecommendationsPage";
import SalesPage from "./pages/SalesPage";

function ProtectedShell() {
  const { loading, user } = useAuth();

  if (loading) {
    return <LoadingState title="Opening your workspace..." />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <AppShell />;
}

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<ProtectedShell />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/store" element={<InventoryPage />} />
        <Route path="/sales" element={<SalesPage />} />
        <Route path="/forecasting" element={<ForecastsPage />} />
        <Route path="/recommendations" element={<RecommendationsPage />} />
        <Route path="/customer-service" element={<CustomerServicePage />} />
        <Route path="/sale" element={<Navigate to="/sales" replace />} />
        <Route path="/assistant" element={<AssistantPage />} />
        <Route path="/chat" element={<Navigate to="/assistant" replace />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
