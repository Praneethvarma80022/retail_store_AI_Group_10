import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import EmptyState from "../components/EmptyState";
import LoadingState from "../components/LoadingState";
import MetricCard from "../components/MetricCard";
import SectionCard from "../components/SectionCard";
import StatusPill from "../components/StatusPill";
import TrendBars from "../components/TrendBars";
import api, { getErrorMessage } from "../lib/api";
import { formatCurrency, formatDate, formatNumber } from "../lib/formatters";

export default function DashboardPage() {
  const navigate = useNavigate();
  const [summary, setSummary] = useState(null);
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadDashboard() {
    setLoading(true);
    setError("");

    try {
      const [summaryResponse, healthResponse] = await Promise.all([
        api.get("/analytics/overview"),
        api.get("/health"),
      ]);

      setSummary(summaryResponse.data);
      setHealth(healthResponse.data);
    } catch (requestError) {
      setError(
        getErrorMessage(
          requestError,
          "Unable to load the dashboard right now."
        )
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDashboard();
  }, []);

  if (loading) {
    return <LoadingState title="Building your retail command center..." />;
  }

  if (error) {
    return (
      <SectionCard
        title="Dashboard unavailable"
        eyebrow="Connection Issue"
        actions={
          <button type="button" className="button button-primary" onClick={loadDashboard}>
            Retry
          </button>
        }
      >
        <p className="muted-copy">{error}</p>
      </SectionCard>
    );
  }

  const metrics = [
    {
      label: "Revenue",
      value: formatCurrency(summary?.totals?.totalRevenue),
      caption: `${formatNumber(summary?.totals?.totalOrders)} orders completed`,
      tone: "revenue",
    },
    {
      label: "Inventory Value",
      value: formatCurrency(summary?.totals?.inventoryValue),
      caption: `${formatNumber(summary?.totals?.totalUnits)} units currently in stock`,
      tone: "inventory",
    },
    {
      label: "Average Order",
      value: formatCurrency(summary?.totals?.averageOrderValue),
      caption: "Useful for bundling and upsell strategy",
      tone: "default",
    },
    {
      label: "Stock Attention",
      value: formatNumber(summary?.totals?.lowStockCount),
      caption: `${formatNumber(summary?.totals?.outOfStockCount)} items are fully out of stock`,
      tone: "attention",
    },
  ];

  return (
    <div className="dashboard-stack">
      <section className="card-surface quick-panel">
        <div>
          <h3>Quick actions</h3>
          <div className="hero-actions">
            <button
              type="button"
              className="button button-primary"
              onClick={() => navigate("/store")}
            >
              Manage inventory
            </button>
            <button
              type="button"
              className="button button-secondary"
              onClick={() => navigate("/assistant")}
            >
              Open chatbot
            </button>
            <button
              type="button"
              className="button button-secondary"
              onClick={() => navigate("/forecasting")}
            >
              View forecast
            </button>
          </div>
        </div>

        <div className="quick-status">
          <div className="hero-chip-grid">
            <span className="meta-pill">
              {health?.storageMode === "mongo" ? "MongoDB live" : "Local mode ready"}
            </span>
            <span className="meta-pill">
              {health?.aiConfigured ? "Gemini connected" : "Rules active"}
            </span>
            <span className="meta-pill">Updated {formatDate(summary?.generatedAt)}</span>
          </div>
        </div>
      </section>

      <div className="metric-grid">
        {metrics.map((metric) => (
          <MetricCard key={metric.label} {...metric} />
        ))}
      </div>

      <div className="content-grid two-column">
        <SectionCard title="Sales momentum" eyebrow="Last 7 Days">
          {summary?.salesTrend?.length ? (
            <TrendBars
              items={summary.salesTrend}
              labelKey="label"
              valueKey="revenue"
              valueFormatter={formatCurrency}
              helper={(item) => `${item.orders} orders`}
            />
          ) : (
            <EmptyState
              title="No sales trend yet"
              description="Create a few sales and the weekly trend will appear here."
            />
          )}
        </SectionCard>

        <SectionCard title="Executive highlights" eyebrow="Key Signals">
          <div className="insight-list">
            {summary?.insights?.map((insight) => (
              <article key={insight.title} className="insight-card">
                <div className="insight-header">
                  <h4>{insight.title}</h4>
                  <StatusPill value={insight.tone} tone={insight.tone} />
                </div>
                <p>{insight.description}</p>
              </article>
            ))}
          </div>
        </SectionCard>
      </div>

      <div className="content-grid three-column">
        <SectionCard title="Low stock watchlist" eyebrow="Restock First">
          {summary?.lowStockItems?.length ? (
            <div className="list-stack">
              {summary.lowStockItems.map((item) => (
                <article key={item.id} className="list-card">
                  <div>
                    <h4>{item.name}</h4>
                    <p>{formatCurrency(item.price)} each</p>
                  </div>
                  <div className="list-card-meta">
                    <StatusPill value={item.status} />
                    <strong>{item.quantity} left</strong>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState
              title="Stock levels look healthy"
              description="Nothing needs urgent replenishment right now."
            />
          )}
        </SectionCard>

        <SectionCard title="Best sellers" eyebrow="High Velocity">
          {summary?.topProducts?.length ? (
            <div className="list-stack">
              {summary.topProducts.map((item) => (
                <article key={item.name} className="list-card">
                  <div>
                    <h4>{item.name}</h4>
                    <p>{item.unitsSold} units sold</p>
                  </div>
                  <strong>{formatCurrency(item.revenue)}</strong>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No sales history"
              description="Best-seller rankings will appear after the first few orders."
            />
          )}
        </SectionCard>

        <SectionCard title="Recent sales" eyebrow="Latest Orders">
          {summary?.recentSales?.length ? (
            <div className="list-stack">
              {summary.recentSales.map((sale) => (
                <article key={sale.id} className="list-card">
                  <div>
                    <h4>{sale.productName}</h4>
                    <p>
                      {sale.customerName} - {formatDate(sale.date)}
                    </p>
                  </div>
                  <strong>{formatCurrency(sale.totalPrice)}</strong>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No recent orders"
              description="New transactions will appear here the moment they are recorded."
            />
          )}
        </SectionCard>
      </div>

      <div className="content-grid two-column">
        <SectionCard title="Recommended actions" eyebrow="What To Do Next">
          {summary?.recommendedActions?.length ? (
            <ul className="action-list">
              {summary.recommendedActions.map((action) => (
                <li key={action}>{action}</li>
              ))}
            </ul>
          ) : (
            <EmptyState
              title="No action prompts yet"
              description="As the catalog and sales history grow, the system will surface sharper recommendations."
            />
          )}
        </SectionCard>

        <SectionCard
          title="Assistant quick prompts"
          eyebrow="Fast Questions"
          actions={
            <button
              type="button"
              className="button button-secondary"
              onClick={() => navigate("/assistant")}
            >
              Open assistant
            </button>
          }
        >
          <div className="prompt-grid">
            {summary?.assistantPrompts?.map((prompt) => (
              <button
                key={prompt}
                type="button"
                className="prompt-chip"
                onClick={() => navigate("/assistant", { state: { prompt } })}
              >
                {prompt}
              </button>
            ))}
          </div>
        </SectionCard>
      </div>

      <div className="content-grid two-column">
        <SectionCard
          title="7-day forecast"
          eyebrow="Sales Analysis"
          actions={
            <button
              type="button"
              className="button button-secondary"
              onClick={() => navigate("/forecasting")}
            >
              Open forecasting
            </button>
          }
        >
          <div className="insight-list">
            <article className="insight-card">
              <div className="insight-header">
                <h4>Expected revenue</h4>
                <span className="meta-pill">{summary?.forecast?.summary?.confidenceLabel || "Forecast ready"}</span>
              </div>
              <p>
                {formatCurrency(summary?.forecast?.summary?.expectedRevenue)} expected over the next 7 days across {" "}
                {formatNumber(summary?.forecast?.summary?.expectedOrders)} projected orders.
              </p>
            </article>
            <article className="insight-card">
              <div className="insight-header">
                <h4>Trend direction</h4>
                <span className="meta-pill">{summary?.forecast?.summary?.trendDirection || "steady"}</span>
              </div>
              <p>
                Daily baseline revenue is {formatCurrency(summary?.forecast?.summary?.dailyAverageRevenue)} using the
                recent sales window.
              </p>
            </article>
          </div>
        </SectionCard>

        <SectionCard
          title="Customer service automation"
          eyebrow="Retention And Support"
          actions={
            <button
              type="button"
              className="button button-secondary"
              onClick={() => navigate("/customer-service")}
            >
              Open customer care
            </button>
          }
        >
          <div className="insight-list">
            <article className="insight-card">
              <div className="insight-header">
                <h4>Repeat buyers</h4>
                <span className="meta-pill">{formatNumber(summary?.customerInsights?.totals?.repeatCustomers)}</span>
              </div>
              <p>
                Use follow-up and upsell flows to retain your strongest existing customers.
              </p>
            </article>
            <article className="insight-card">
              <div className="insight-header">
                <h4>Automation templates</h4>
                <span className="meta-pill">{formatNumber(summary?.customerService?.totals?.readyTemplates)}</span>
              </div>
              <p>
                Availability, restock, thank-you, and upsell replies are ready to generate from live store data.
              </p>
            </article>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
