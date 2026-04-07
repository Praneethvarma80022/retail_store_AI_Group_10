import { useDeferredValue, useEffect, useState } from "react";

import EmptyState from "../components/EmptyState";
import LoadingState from "../components/LoadingState";
import MetricCard from "../components/MetricCard";
import SectionCard from "../components/SectionCard";
import StatusPill from "../components/StatusPill";
import api, { getErrorMessage } from "../lib/api";
import { downloadCsv } from "../lib/exporters";
import {
  formatCurrency,
  formatDate,
  formatNumber,
} from "../lib/formatters";

const initialForm = {
  customerName: "",
  mobile: "",
  productId: "",
  quantity: "1",
};

export default function SalesPage() {
  const [products, setProducts] = useState([]);
  const [sales, setSales] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [notice, setNotice] = useState(null);

  const deferredSearch = useDeferredValue(search);

  async function loadData() {
    setLoading(true);

    try {
      const [productsResponse, salesResponse] = await Promise.all([
        api.get("/store/names"),
        api.get("/sales"),
      ]);

      setProducts(productsResponse.data);
      setSales(salesResponse.data);
    } catch (error) {
      setNotice({
        type: "error",
        text: getErrorMessage(error, "Unable to load sales data."),
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  const selectedProduct = products.find((product) => product.id === form.productId);
  const filteredSales = sales.filter((sale) => {
    const haystack = `${sale.customerName} ${sale.productName} ${sale.mobile}`
      .toLowerCase()
      .trim();

    return haystack.includes(deferredSearch.trim().toLowerCase());
  });

  const totalRevenue = sales.reduce((sum, sale) => sum + (sale.totalPrice || 0), 0);
  const totalUnitsSold = sales.reduce((sum, sale) => sum + (sale.quantity || 0), 0);
  const averageOrderValue = sales.length ? totalRevenue / sales.length : 0;

  function handleFormChange(event) {
    const { name, value } = event.target;
    setForm((current) => ({
      ...current,
      [name]: value,
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setProcessing(true);
    setNotice(null);

    try {
      await api.post("/sales", {
        ...form,
        productName: selectedProduct?.name,
      });

      setNotice({
        type: "success",
        text: "Sale recorded and inventory updated successfully.",
      });
      setForm(initialForm);
      await loadData();
    } catch (error) {
      setNotice({
        type: "error",
        text: getErrorMessage(error, "Unable to complete this sale."),
      });
    } finally {
      setProcessing(false);
    }
  }

  function handleExport() {
    downloadCsv(
      "sales-report.csv",
      ["Customer", "Mobile", "Product", "Quantity", "Order Value", "Date"],
      filteredSales.map((sale) => [
        sale.customerName,
        sale.mobile,
        sale.productName,
        sale.quantity,
        sale.totalPrice,
        formatDate(sale.date),
      ])
    );
  }

  if (loading) {
    return <LoadingState title="Preparing the sales desk..." />;
  }

  return (
    <div className="page-stack">
      <div className="metric-grid">
        <MetricCard
          label="Revenue"
          value={formatCurrency(totalRevenue)}
          caption={`${formatNumber(sales.length)} completed orders`}
          tone="revenue"
        />
        <MetricCard
          label="Units Sold"
          value={formatNumber(totalUnitsSold)}
          caption="Total quantity moved through sales"
          tone="inventory"
        />
        <MetricCard
          label="Average Order"
          value={formatCurrency(averageOrderValue)}
          caption="Average value per completed purchase"
          tone="default"
        />
      </div>

      {notice ? (
        <div className={`alert-banner alert-${notice.type}`}>{notice.text}</div>
      ) : null}

      <div className="content-grid two-column">
        <SectionCard title="Create a sale" eyebrow="Checkout Form">
          <form className="form-grid" onSubmit={handleSubmit}>
            <label className="field-group">
              <span className="field-label">Customer name</span>
              <input
                name="customerName"
                value={form.customerName}
                onChange={handleFormChange}
                placeholder="Customer name"
                className="field-input"
              />
            </label>

            <label className="field-group">
              <span className="field-label">Mobile number</span>
              <input
                name="mobile"
                value={form.mobile}
                onChange={handleFormChange}
                placeholder="Optional mobile number"
                className="field-input"
              />
            </label>

            <label className="field-group">
              <span className="field-label">Select product</span>
              <select
                name="productId"
                value={form.productId}
                onChange={handleFormChange}
                className="field-input"
              >
                <option value="">Choose a product</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="field-group">
              <span className="field-label">Quantity</span>
              <input
                name="quantity"
                type="number"
                min="1"
                max={selectedProduct?.quantity || undefined}
                value={form.quantity}
                onChange={handleFormChange}
                className="field-input"
              />
            </label>

            <div className="button-row">
              <button
                type="submit"
                className="button button-primary"
                disabled={processing}
              >
                {processing ? "Processing..." : "Complete sale"}
              </button>
            </div>
          </form>
        </SectionCard>

        <SectionCard
          title="Sale preview"
          eyebrow="Before You Submit"
          actions={
            <button type="button" className="button button-secondary" onClick={handleExport}>
              Export sales CSV
            </button>
          }
        >
          {selectedProduct ? (
            <div className="preview-card">
              <div className="preview-row">
                <span>Selected item</span>
                <strong>{selectedProduct.name}</strong>
              </div>
              <div className="preview-row">
                <span>Available stock</span>
                <strong>{formatNumber(selectedProduct.quantity)}</strong>
              </div>
              <div className="preview-row">
                <span>Unit price</span>
                <strong>{formatCurrency(selectedProduct.price)}</strong>
              </div>
              <div className="preview-row">
                <span>Category</span>
                <strong>{selectedProduct.category || "General"}</strong>
              </div>
              <div className="preview-row">
                <span>SKU</span>
                <strong>{selectedProduct.sku || "Auto"}</strong>
              </div>
              <div className="preview-row">
                <span>Status</span>
                <StatusPill value={selectedProduct.status} />
              </div>
              <div className="preview-row preview-total">
                <span>Estimated total</span>
                <strong>
                  {formatCurrency(
                    (Number(form.quantity) || 0) * (Number(selectedProduct.price) || 0)
                  )}
                </strong>
              </div>
            </div>
          ) : (
            <EmptyState
              title="Select a product"
              description="Choose an item to see live stock, price, and order total."
            />
          )}
        </SectionCard>
      </div>

      <SectionCard title="Recent sales" eyebrow="Searchable Order Log">
        <div className="filter-row">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search customer, product, or mobile number"
            className="field-input"
          />
        </div>

        {filteredSales.length ? (
          <div className="data-table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Product</th>
                  <th>Quantity</th>
                  <th>Order Value</th>
                  <th>Mobile</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {filteredSales.map((sale) => (
                  <tr key={sale.id}>
                    <td>{sale.customerName}</td>
                    <td>{sale.productName}</td>
                    <td>{formatNumber(sale.quantity)}</td>
                    <td>{formatCurrency(sale.totalPrice)}</td>
                    <td>{sale.mobile || "Not provided"}</td>
                    <td>{formatDate(sale.date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title="No matching sales"
            description="Adjust the search or complete a new sale to populate the log."
          />
        )}
      </SectionCard>
    </div>
  );
}
