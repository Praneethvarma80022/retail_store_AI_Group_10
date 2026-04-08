import { useEffect, useState } from "react";
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

import EmptyState from "../components/EmptyState";
import LoadingState from "../components/LoadingState";
import MetricCard from "../components/MetricCard";
import SectionCard from "../components/SectionCard";
import api, { getErrorMessage } from "../lib/api";
import { formatCurrency, formatNumber } from "../lib/formatters";

function RecommendationList({ items, emptyTitle, emptyDescription }) {
  if (!items?.length) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <div className="list-stack">
      {items.map((item) => (
        <article key={`${item.name}-${item.action}`} className="list-card">
          <div>
            <h4>{item.name}</h4>
            <p>{item.reason}</p>
          </div>
          <div className="list-card-meta">
            <span className="meta-pill">{item.action}</span>
            <strong>{formatCurrency(item.revenue)}</strong>
          </div>
        </article>
      ))}
    </div>
  );
}

export default function RecommendationsPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Sample data for visualization charts
  const sampleRecommendationMetrics = {
    top: [
      { name: "Product A", confidence: 95 },
      { name: "Product B", confidence: 87 },
      { name: "Product C", confidence: 82 },
      { name: "Product D", confidence: 78 },
      { name: "Product E", confidence: 72 },
      { name: "Product F", confidence: 68 },
      { name: "Product G", confidence: 65 },
      { name: "Product H", confidence: 60 }
    ],
    types: [
      { name: "Promotion", value: 35 },
      { name: "Restock", value: 30 },
      { name: "Bundle", value: 20 },
      { name: "Upsell", value: 15 }
    ]
  };

  async function loadRecommendations() {
    setLoading(true);
    setError("");

    try {
      const analyticsResponse = await api.get("/analytics/recommendations");
      setData(analyticsResponse.data);
    } catch (requestError) {
      setError(
        getErrorMessage(
          requestError,
          "Unable to load product recommendations right now."
        )
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadRecommendations();
  }, []);

  if (loading) {
    return <LoadingState title="Scanning the catalog for next-best actions..." />;
  }

  if (error) {
    return (
      <SectionCard
        title="Recommendations unavailable"
        eyebrow="Connection Issue"
        actions={
          <button type="button" className="button button-primary" onClick={loadRecommendations}>
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
          label="Promotion Candidates"
          value={formatNumber(data?.featured?.length)}
          caption="Products ready for visibility and conversion pushes"
          tone="revenue"
        />
        <MetricCard
          label="Restock Priorities"
          value={formatNumber(data?.restockPriorities?.length)}
          caption="Items that risk lost sales without replenishment"
          tone="attention"
        />
        <MetricCard
          label="Slow Movers"
          value={formatNumber(data?.slowMovers?.length)}
          caption="Stock that may need bundling, offers, or repositioning"
          tone="inventory"
        />
        <MetricCard
          label="Bundle Ideas"
          value={formatNumber(data?.bundleIdeas?.length)}
          caption="Ready-made pairings to increase basket size"
          tone="default"
        />
      </div>

      <div className="content-grid two-column">
        <SectionCard title="Promote now" eyebrow="Healthy Demand">
          <RecommendationList
            items={data?.featured}
            emptyTitle="No featured recommendations"
            emptyDescription="Once products have both stock and sales velocity, they will appear here."
          />
        </SectionCard>

        <SectionCard title="Restock first" eyebrow="Protect Revenue">
          <RecommendationList
            items={data?.restockPriorities}
            emptyTitle="No urgent restock actions"
            emptyDescription="The current catalog does not have any item below its reorder point."
          />
        </SectionCard>
      </div>

      <div className="content-grid two-column">
        <SectionCard title="Slow movers" eyebrow="Stock Efficiency">
          <RecommendationList
            items={data?.slowMovers}
            emptyTitle="No slow movers flagged"
            emptyDescription="Everything in the catalog is moving at an acceptable rate right now."
          />
        </SectionCard>

        <SectionCard title="Bundle opportunities" eyebrow="Increase Basket Size">
          {data?.bundleIdeas?.length ? (
            <div className="insight-list">
              {data.bundleIdeas.map((idea) => (
                <article key={idea.title} className="insight-card">
                  <div className="insight-header">
                    <h4>{idea.title}</h4>
                    <span className="meta-pill">{idea.products.join(" + ")}</span>
                  </div>
                  <p>{idea.description}</p>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No bundles found"
              description="As the catalog grows, the system will suggest more complementary product pairings."
            />
          )}
        </SectionCard>
      </div>

      <div className="content-grid two-column">
        <SectionCard title="Recommendation Confidence" eyebrow="Prediction Strength (Sample)">
          <div style={{ width: "100%", height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={sampleRecommendationMetrics.top}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(127, 173, 187, 0.18)" />
                <XAxis dataKey="name" stroke="#9eb6c3" fontSize={11} />
                <YAxis stroke="#9eb6c3" fontSize={12} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "rgba(17, 35, 49, 0.9)",
                    border: "1px solid #c4b5fd",
                    borderRadius: "8px",
                  }}
                  formatter={(value) => `${value}%`}
                />
                <Bar dataKey="confidence" fill="#c4b5fd" radius={[8, 8, 0, 0]} name="Confidence %" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>

        <SectionCard title="Recommendation Types" eyebrow="Action Distribution (Sample)">
          <div style={{ width: "100%", height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={sampleRecommendationMetrics.types}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, value }) => `${name}: ${value}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {sampleRecommendationMetrics.types.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={["#38c7b3", "#ff8f3d", "#ff6f61", "#9eb6c3", "#c4b5fd"][index % 5]}
                    />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => `${value}%`} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Catalog spotlight" eyebrow="Merchandising Snapshot">
        <div className="content-grid three-column">
          {[
            {
              label: "Cheapest",
              item: data?.spotlight?.cheapest,
            },
            {
              label: "Premium",
              item: data?.spotlight?.premium,
            },
            {
              label: "Best seller",
              item: data?.spotlight?.bestseller,
            },
          ].map((card) => (
            <article key={card.label} className="insight-card">
              <div className="insight-header">
                <h4>{card.label}</h4>
                <span className="meta-pill">{card.item?.category || "N/A"}</span>
              </div>
              {card.item ? (
                <>
                  <p>{card.item.name}</p>
                  <strong>{formatCurrency(card.item.price || card.item.revenue)}</strong>
                </>
              ) : (
                <p>No data available yet.</p>
              )}
            </article>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
