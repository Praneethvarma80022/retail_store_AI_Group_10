import { useEffect, useState } from "react";

import EmptyState from "../components/EmptyState";
import LoadingState from "../components/LoadingState";
import MetricCard from "../components/MetricCard";
import SectionCard from "../components/SectionCard";
import TrendBars from "../components/TrendBars";
import api, { getErrorMessage } from "../lib/api";
import { formatCurrency, formatNumber, formatPercent } from "../lib/formatters";

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

  return (
    <div className="page-stack">
      <div className="metric-grid">
        <MetricCard
          label="Projected 7-Day Revenue"
          value={formatCurrency(forecast?.summary?.expectedRevenue)}
          caption="Expected topline if recent momentum continues"
          tone="revenue"
        />
        <MetricCard
          label="Projected Orders"
          value={formatNumber(forecast?.summary?.expectedOrders)}
          caption="Estimated order count across the next week"
          tone="inventory"
        />
        <MetricCard
          label="Daily Baseline"
          value={formatCurrency(forecast?.summary?.dailyAverageRevenue)}
          caption="Average revenue used as the forecasting base"
          tone="default"
        />
        <MetricCard
          label="Confidence"
          value={formatPercent(forecast?.summary?.confidenceScore)}
          caption={forecast?.summary?.confidenceLabel || "Forecast confidence"}
          tone="attention"
        />
      </div>

      <div className="content-grid two-column">
        <SectionCard title="Recent demand signal" eyebrow="Last 14 Days">
          {forecast?.history?.length ? (
            <TrendBars
              items={forecast.history}
              labelKey="label"
              valueKey="revenue"
              valueFormatter={formatCurrency}
              helper={(item) => `${item.orders} orders - ${item.units} units`}
            />
          ) : (
            <EmptyState
              title="No historical trend"
              description="Sales activity will appear here once more orders are recorded."
            />
          )}
        </SectionCard>

        <SectionCard title="Forward projection" eyebrow="Next 7 Days">
          {forecast?.next7Days?.length ? (
            <TrendBars
              items={forecast.next7Days}
              labelKey="label"
              valueKey="projectedRevenue"
              valueFormatter={formatCurrency}
              helper={(item) => `About ${item.projectedOrders} orders`}
            />
          ) : (
            <EmptyState
              title="No projection yet"
              description="The system needs sales history to produce a meaningful forecast."
            />
          )}
        </SectionCard>
      </div>

      <SectionCard title="Forecast notes" eyebrow="Interpretation">
        <div className="insight-list">
          <article className="insight-card">
            <div className="insight-header">
              <h4>Trend direction</h4>
              <span className="meta-pill">{forecast?.summary?.trendDirection || "steady"}</span>
            </div>
            <p>
              The current model uses a weighted moving average of recent daily revenue
              and adjusts for short-term trend changes.
            </p>
          </article>

          <article className="insight-card">
            <div className="insight-header">
              <h4>Confidence signal</h4>
              <span className="meta-pill">{forecast?.summary?.confidenceLabel || "Moderate confidence"}</span>
            </div>
            <p>
              Confidence improves as daily order flow becomes more consistent and the
              last week contains more completed sales.
            </p>
          </article>
        </div>
      </SectionCard>
    </div>
  );
}
