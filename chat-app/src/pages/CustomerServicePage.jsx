import { useEffect, useState } from "react";

import EmptyState from "../components/EmptyState";
import LoadingState from "../components/LoadingState";
import MetricCard from "../components/MetricCard";
import SectionCard from "../components/SectionCard";
import api, { getErrorMessage } from "../lib/api";
import { formatCurrency, formatNumber } from "../lib/formatters";

const initialForm = {
  customerName: "",
  type: "availability",
  productId: "",
};

export default function CustomerServicePage() {
  const [customerInsights, setCustomerInsights] = useState(null);
  const [serviceData, setServiceData] = useState(null);
  const [products, setProducts] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [generatedReply, setGeneratedReply] = useState("");
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [notice, setNotice] = useState(null);

  async function loadCustomerService() {
    setLoading(true);
    setNotice(null);

    try {
      const [customersResponse, serviceResponse, productsResponse] = await Promise.all([
        api.get("/analytics/customers"),
        api.get("/analytics/customer-service"),
        api.get("/store/names"),
      ]);

      setCustomerInsights(customersResponse.data);
      setServiceData(serviceResponse.data);
      setProducts(productsResponse.data);
    } catch (requestError) {
      setNotice({
        type: "error",
        text: getErrorMessage(
          requestError,
          "Unable to load customer-service automation right now."
        ),
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCustomerService();
  }, []);

  function handleFormChange(event) {
    const { name, value } = event.target;
    setForm((current) => ({
      ...current,
      [name]: value,
    }));
  }

  async function handleGenerateReply(event) {
    event.preventDefault();
    setGenerating(true);
    setNotice(null);

    try {
      const response = await api.post("/customer-service/reply", form);
      setGeneratedReply(response.data.reply);
      setNotice({
        type: "success",
        text: "Customer reply drafted successfully.",
      });
    } catch (requestError) {
      setNotice({
        type: "error",
        text: getErrorMessage(
          requestError,
          "Unable to generate a customer reply right now."
        ),
      });
    } finally {
      setGenerating(false);
    }
  }

  async function handleCopyReply() {
    if (!generatedReply) return;

    try {
      await navigator.clipboard.writeText(generatedReply);
      setNotice({
        type: "success",
        text: "Reply copied to clipboard.",
      });
    } catch {
      setNotice({
        type: "error",
        text: "Unable to copy the reply automatically.",
      });
    }
  }

  if (loading) {
    return <LoadingState title="Preparing customer-service automations..." />;
  }

  return (
    <div className="page-stack">
      <div className="metric-grid">
        <MetricCard
          label="Customers"
          value={formatNumber(customerInsights?.totals?.totalCustomers)}
          caption="Known customers with recorded purchase history"
          tone="inventory"
        />
        <MetricCard
          label="Repeat Buyers"
          value={formatNumber(customerInsights?.totals?.repeatCustomers)}
          caption="Customers ready for retention and loyalty outreach"
          tone="revenue"
        />
        <MetricCard
          label="VIP Buyers"
          value={formatNumber(customerInsights?.totals?.vipCustomers)}
          caption="High-value customers worth proactive attention"
          tone="attention"
        />
        <MetricCard
          label="Avg Spend"
          value={formatCurrency(customerInsights?.totals?.averageSpend)}
          caption="Average customer revenue contribution"
          tone="default"
        />
      </div>

      {notice ? (
        <div className={`alert-banner alert-${notice.type}`}>{notice.text}</div>
      ) : null}

      <div className="content-grid two-column">
        <SectionCard title="Generate a customer reply" eyebrow="Automation Composer">
          <form className="form-grid" onSubmit={handleGenerateReply}>
            <label className="field-group">
              <span className="field-label">Customer name</span>
              <input
                name="customerName"
                value={form.customerName}
                onChange={handleFormChange}
                placeholder="Example: Maya Patel"
                className="field-input"
              />
            </label>

            <label className="field-group">
              <span className="field-label">Reply type</span>
              <select
                name="type"
                value={form.type}
                onChange={handleFormChange}
                className="field-input"
              >
                <option value="availability">Availability check</option>
                <option value="restock">Back-in-stock reply</option>
                <option value="thank-you">Thank-you follow-up</option>
                <option value="upsell">Upsell suggestion</option>
                <option value="follow-up">Post-purchase check-in</option>
              </select>
            </label>

            <label className="field-group">
              <span className="field-label">Product</span>
              <select
                name="productId"
                value={form.productId}
                onChange={handleFormChange}
                className="field-input"
              >
                <option value="">Optional product</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name}
                  </option>
                ))}
              </select>
            </label>

            <div className="button-row">
              <button type="submit" className="button button-primary" disabled={generating}>
                {generating ? "Generating..." : "Generate reply"}
              </button>
            </div>
          </form>
        </SectionCard>

        <SectionCard
          title="Generated message"
          eyebrow="Ready To Send"
          actions={
            <button
              type="button"
              className="button button-secondary"
              onClick={handleCopyReply}
              disabled={!generatedReply}
            >
              Copy reply
            </button>
          }
        >
          {generatedReply ? (
            <div className="response-preview">
              <p>{generatedReply}</p>
            </div>
          ) : (
            <EmptyState
              title="No reply generated yet"
              description="Choose a reply type and product, then generate a ready-to-send customer message."
            />
          )}
        </SectionCard>
      </div>

      <div className="content-grid two-column">
        <SectionCard title="Top customers" eyebrow="Revenue Leaders">
          {customerInsights?.topCustomers?.length ? (
            <div className="list-stack">
              {customerInsights.topCustomers.map((customer) => (
                <article key={customer.customerName} className="list-card">
                  <div>
                    <h4>{customer.customerName}</h4>
                    <p>{customer.orderCount} orders</p>
                  </div>
                  <strong>{formatCurrency(customer.revenue)}</strong>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No customers yet"
              description="Customer profiles will appear as sales are recorded."
            />
          )}
        </SectionCard>

        <SectionCard title="Customer segments" eyebrow="Retention Focus">
          {customerInsights?.segments?.length ? (
            <div className="insight-list">
              {customerInsights.segments.map((segment) => (
                <article key={segment.title} className="insight-card">
                  <div className="insight-header">
                    <h4>{segment.title}</h4>
                    <span className="meta-pill">{segment.count}</span>
                  </div>
                  <p>{segment.description}</p>
                  {segment.customers?.length ? (
                    <p className="muted-copy">Examples: {segment.customers.join(", ")}</p>
                  ) : null}
                </article>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No customer segments"
              description="Segments will be created automatically as more customers place orders."
            />
          )}
        </SectionCard>
      </div>

      <SectionCard title="Automation playbooks" eyebrow="Customer Service Automation">
        {serviceData?.templates?.length ? (
          <div className="content-grid two-column">
            {serviceData.templates.map((template) => (
              <article key={template.id} className="insight-card">
                <div className="insight-header">
                  <h4>{template.title}</h4>
                  <span className="meta-pill">{template.id}</span>
                </div>
                <p>{template.description}</p>
                <p className="muted-copy">{template.preview}</p>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No automation templates"
            description="Automation templates will appear here once service data is available."
          />
        )}
      </SectionCard>
    </div>
  );
}
