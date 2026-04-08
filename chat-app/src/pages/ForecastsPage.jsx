import { useEffect, useState } from "react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";

import EmptyState from "../components/EmptyState";
import LoadingState from "../components/LoadingState";
import MetricCard from "../components/MetricCard";
import SectionCard from "../components/SectionCard";
import TrendBars from "../components/TrendBars";
import api, { getErrorMessage } from "../lib/api";
import { formatCurrency, formatNumber, formatPercent } from "../lib/formatters";

function rangeLabel(range = {}) {
  return `${formatCurrency(range.low)} - ${formatCurrency(range.high)}`;
}

export default function ForecastsPage() {
  const [forecast, setForecast] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadForecast() {
    setLoading(true);
    setError("");

    try {
      const response = await api.get("/analytics/forecast");
      setForecast(response.data);
    } catch (requestError) {
      setError(
        getErrorMessage(
          requestError,
          "Unable to load forecasting intelligence right now."
        )
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadForecast();
  }, []);

  if (loading) {
    return <LoadingState title="Calculating the next sales window..." />;
  }

  if (error) {
    return (
      <SectionCard
        title="Forecast unavailable"
        eyebrow="Connection Issue"
        actions={
          <button type="button" className="button button-primary" onClick={loadForecast}>
            Retry
          </button>
        }
      >
        <p className="muted-copy">{error}</p>
      </SectionCard>
    );
  }

  const hasHistory = forecast?.history?.some((day) => day.orders > 0);
  const chartColors = ["#38c7b3", "#ff8f3d", "#ff6f61", "#9eb6c3", "#c4b5fd"];

  const historyData = (forecast?.history || []).map((day, idx) => ({
    name: day.label || `Day ${idx + 1}`,
    revenue: day.revenue || 0,
    orders: day.orders || 0,
    units: day.units || 0,
  }));

  // Convert forecast data
  const forecastData = (forecast?.next7Days || []).map((day, idx) => ({
    name: day.label || `Day ${idx + 1}`,
    projected: day.projectedRevenue || 0,
    orders: day.projectedOrders || 0,
    units: day.projectedUnits || 0,
  }));

  // Category distribution for pie chart
  const categoryData = (forecast?.categoryDistribution || []).map((cat) => ({
    name: cat.category || "Unknown",
    value: cat.value || 0,
  }));

  return (
    <div className="page-stack">
      <div className="metric-grid">
        <MetricCard
          label="Projected 7-Day Revenue"
          value={formatCurrency(forecast?.summary?.expectedRevenue)}
          caption="Base scenario revenue for the next 7 days"
          tone="revenue"
        />
        <MetricCard
          label="Revenue Range"
          value={rangeLabel(forecast?.summary?.revenueRange)}
          caption="Conservative to optimistic scenario band"
          tone="default"
        />
        <MetricCard
          label="Projected Orders"
          value={formatNumber(forecast?.summary?.expectedOrders)}
          caption={`${formatNumber(forecast?.summary?.expectedUnits)} projected units`}
          tone="inventory"
        />
        <MetricCard
          label="Confidence"
          value={formatPercent(forecast?.summary?.confidenceScore)}
          caption={`${forecast?.summary?.confidenceLabel || "Forecast confidence"} • ${formatPercent(
            forecast?.summary?.dataCoveragePercent
          )} data coverage`}
          tone="attention"
        />
      </div>

      <div className="content-grid two-column">
        <SectionCard title="Demand history" eyebrow={`Last ${forecast?.breakdown?.totalHistoryDays || 21} Days`}>
          {hasHistory && historyData.length > 0 ? (
            <div style={{ width: "100%", height: 300 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={historyData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#38c7b3" stopOpacity={0.8} />
                      <stop offset="95%" stopColor="#38c7b3" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(127, 173, 187, 0.18)" />
                  <XAxis dataKey="name" stroke="#9eb6c3" fontSize={12} />
                  <YAxis stroke="#9eb6c3" fontSize={12} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "rgba(17, 35, 49, 0.9)",
                      border: "1px solid #38c7b3",
                      borderRadius: "8px",
                    }}
                    formatter={(value) => formatCurrency(value)}
                  />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    stroke="#38c7b3"
                    fillOpacity={1}
                    fill="url(#colorRevenue)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState
              title="No historical trend yet"
              description="Forecasting becomes meaningful after a few real sales are recorded."
            />
          )}
        </SectionCard>

        <SectionCard title="Upcoming projection" eyebrow="Next 7 Days">
          {hasHistory && forecastData.length > 0 ? (
            <div style={{ width: "100%", height: 300 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={forecastData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(127, 173, 187, 0.18)" />
                  <XAxis dataKey="name" stroke="#9eb6c3" fontSize={12} />
                  <YAxis stroke="#9eb6c3" fontSize={12} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "rgba(17, 35, 49, 0.9)",
                      border: "1px solid #ff8f3d",
                      borderRadius: "8px",
                    }}
                    formatter={(value) => formatCurrency(value)}
                  />
                  <Legend />
                  <Bar dataKey="projected" fill="#ff8f3d" radius={[8, 8, 0, 0]} name="Projected Revenue" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState
              title="Projection waiting for sales data"
              description="As soon as orders are recorded, the system will generate a usable 7-day forecast."
            />
          )}
        </SectionCard>
      </div>

      <div className="content-grid two-column">
        <SectionCard title="Category distribution" eyebrow="Forecast by Category">
          {categoryData.length > 0 ? (
            <div style={{ width: "100%", height: 300 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categoryData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, value }) => `${name}: ${value}%`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {categoryData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={chartColors[index % chartColors.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => `${value}%`} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState
              title="Category data unavailable"
              description="Category distribution will appear once sufficient data is available."
            />
          )}
        </SectionCard>

        <SectionCard title="Forecast drivers" eyebrow="Why The Number Moved">
          <div className="insight-list">
            <article className="insight-card">
              <div className="insight-header">
                <h4>Recent demand baseline</h4>
                <span className="meta-pill">{forecast?.summary?.baselineWindow || "21 days"}</span>
              </div>
              <p>
                Recent daily revenue is {formatCurrency(forecast?.breakdown?.recentAverageRevenue)} versus{" "}
                {formatCurrency(forecast?.breakdown?.previousAverageRevenue)} in the previous week.
              </p>
            </article>

            <article className="insight-card">
              <div className="insight-header">
                <h4>Trend direction</h4>
                <span className="meta-pill">{forecast?.summary?.trendDirection || "steady"}</span>
              </div>
              <p>
                Revenue trend is {formatPercent(forecast?.breakdown?.revenueTrendPercent)} and order trend is{" "}
                {formatPercent(forecast?.breakdown?.orderTrendPercent)} compared with the previous 7-day window.
              </p>
            </article>

            <article className="insight-card">
              <div className="insight-header">
                <h4>Volatility</h4>
                <span className="meta-pill">{formatPercent(forecast?.breakdown?.volatilityPercent)}</span>
              </div>
              <p>
                Higher volatility widens the scenario range and reduces confidence in the base forecast.
              </p>
            </article>

            <article className="insight-card">
              <div className="insight-header">
                <h4>Weekend effect</h4>
                <span className="meta-pill">{formatPercent(forecast?.breakdown?.weekendUpliftPercent)}</span>
              </div>
              <p>
                The model adjusts for weekday vs weekend behavior so the daily plan reflects real selling patterns.
              </p>
            </article>
          </div>
        </SectionCard>

        <SectionCard title="Scenario planning" eyebrow="Use In Review">
          {forecast?.scenarios?.length ? (
            <div className="insight-list">
              {forecast.scenarios.map((scenario) => (
                <article key={scenario.name} className="insight-card">
                  <div className="insight-header">
                    <h4>{scenario.name}</h4>
                    <span className="meta-pill">{formatNumber(scenario.orders)} orders</span>
                  </div>
                  <p>{formatCurrency(scenario.revenue)} projected revenue.</p>
                  <p>{scenario.note}</p>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState
              title="Scenario planning unavailable"
              description="Forecast scenarios appear when the model has enough sales behavior to project from."
            />
          )}
        </SectionCard>
      </div>

      <div className="content-grid two-column">
        <SectionCard title="How this forecast works" eyebrow="Method">
          {forecast?.methodology?.length ? (
            <ul className="action-list">
              {forecast.methodology.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ul>
          ) : (
            <EmptyState
              title="Method notes unavailable"
              description="Forecast explanation will appear once the model response is loaded."
            />
          )}
        </SectionCard>

        <SectionCard title="Operating guidance" eyebrow="What To Say">
          <div className="insight-list">
            <article className="insight-card">
              <div className="insight-header">
                <h4>Best historical day</h4>
                <span className="meta-pill">{forecast?.breakdown?.topHistoryDay?.label || "N/A"}</span>
              </div>
              <p>
                {forecast?.breakdown?.topHistoryDay
                  ? `${formatCurrency(forecast.breakdown.topHistoryDay.revenue)} from ${forecast.breakdown.topHistoryDay.orders} orders.`
                  : "Not enough history yet."}
              </p>
            </article>

            <article className="insight-card">
              <div className="insight-header">
                <h4>Key risks</h4>
                <span className="meta-pill">
                  {formatNumber(forecast?.risks?.length || 0)} signals
                </span>
              </div>
              <p>
                {forecast?.risks?.[0] || "No major forecast risks detected from the current data."}
              </p>
            </article>

            <article className="insight-card">
              <div className="insight-header">
                <h4>Action recommendation</h4>
                <span className="meta-pill">{forecast?.summary?.method || "Forecast model"}</span>
              </div>
              <p>
                {forecast?.recommendations?.[0] ||
                  "Use the base forecast as the planning number for the coming week."}
              </p>
            </article>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
