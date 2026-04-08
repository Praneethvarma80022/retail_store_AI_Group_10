import { useDeferredValue, useEffect, useRef, useState } from "react";
import {
  LineChart,
  Line,
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
import StatusPill from "../components/StatusPill";
import api, { getErrorMessage } from "../lib/api";
import { downloadCsv, downloadExcel, parseCsv } from "../lib/exporters";
import {
  formatCurrency,
  formatDate,
  formatNumber,
} from "../lib/formatters";
import { mapSalesImportRows } from "../lib/importers";

const initialForm = {
  customerName: "",
  mobile: "",
  productId: "",
  quantity: "1",
};

// Sample data for chart visualization
const sampleSalesCharts = {
  categoryDistribution: [
    { name: "Beauty", value: 30 },
    { name: "Clothing", value: 35 },
    { name: "Electronics", value: 25 },
    { name: "Accessories", value: 10 }
  ],
  salesTrend: {
    data: [
      { date: "Day 1", sales: 4200 },
      { date: "Day 2", sales: 5100 },
      { date: "Day 3", sales: 3800 },
      { date: "Day 4", sales: 6200 },
      { date: "Day 5", sales: 5800 },
      { date: "Day 6", sales: 7100 },
      { date: "Day 7", sales: 6500 }
    ]
  }
};

export default function SalesPage() {
  const importInputRef = useRef(null);
  const [products, setProducts] = useState([]);
  const [sales, setSales] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [importing, setImporting] = useState(false);
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
  const requestedQuantity = Number(form.quantity) || 0;
  const availableQuantity = Number(selectedProduct?.quantity) || 0;
  const mobileValue = form.mobile.trim();
  const mobileInvalid =
    Boolean(mobileValue) && !/^[0-9+\-\s]{7,15}$/.test(mobileValue);
  const quantityError = !selectedProduct
    ? ""
    : requestedQuantity <= 0
      ? "Quantity must be at least 1."
      : requestedQuantity > availableQuantity
        ? `Only ${formatNumber(availableQuantity)} units are available for ${selectedProduct.name}.`
        : "";
  const customerNameMissing = !form.customerName.trim();
  const saleBlocked =
    processing ||
    customerNameMissing ||
    !selectedProduct ||
    mobileInvalid ||
    Boolean(quantityError);
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

    if (saleBlocked) {
      setNotice({
        type: "error",
        text:
          quantityError ||
          (mobileInvalid
            ? "Enter a valid mobile number or leave it blank."
            : customerNameMissing
              ? "Customer name is required."
              : "Select a valid product before completing the sale."),
      });
      return;
    }

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

  function handleExportCsv() {
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

  function handleExportExcel() {
    downloadExcel(
      "sales-report.xls",
      ["Customer", "Mobile", "Product", "Quantity", "Order Value", "Date"],
      filteredSales.map((sale) => [
        sale.customerName,
        sale.mobile,
        sale.productName,
        sale.quantity,
        sale.totalPrice,
        formatDate(sale.date),
      ]),
      "Sales"
    );
  }

  function handleImportClick() {
    importInputRef.current?.click();
  }

  async function handleImportFile(event) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    setImporting(true);
    setNotice(null);

    try {
      const rows = parseCsv(await file.text());
      const mappedRows = mapSalesImportRows(rows);

      if (!mappedRows.length) {
        throw new Error("The selected CSV file does not contain import rows.");
      }

      const response = await api.post("/sales/import", {
        rows: mappedRows,
      });
      const summary = response.data;
      const errorLines = (summary.errors || [])
        .slice(0, 3)
        .map((item) => `Row ${item.row}: ${item.message}`)
        .join(" ");

      setNotice({
        type: summary.errors?.length ? "error" : "success",
        text: [
          `Sales import finished. ${summary.imported || 0} sale(s) imported.`,
          summary.errors?.length
            ? `${summary.errors.length} row(s) failed. ${errorLines}`
            : "All rows were processed successfully.",
        ].join(" "),
      });
      await loadData();
    } catch (error) {
      setNotice({
        type: "error",
        text: getErrorMessage(error, "Unable to import sales CSV."),
      });
    } finally {
      setImporting(false);
    }
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
              {mobileInvalid ? (
                <span className="field-error">
                  Mobile number must be 7 to 15 digits and may include + or -.
                </span>
              ) : null}
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
              {quantityError ? (
                <span className="field-error">{quantityError}</span>
              ) : selectedProduct ? (
                <span className="field-hint">
                  Maximum allowed: {formatNumber(availableQuantity)} units.
                </span>
              ) : null}
            </label>

            <div className="button-row">
              <button
                type="submit"
                className="button button-primary"
                disabled={saleBlocked}
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
            <div className="section-button-group">
              <button
                type="button"
                className="button button-secondary"
                onClick={handleImportClick}
                disabled={importing}
              >
                {importing ? "Importing..." : "Import CSV"}
              </button>
              <button type="button" className="button button-secondary" onClick={handleExportCsv}>
                Export CSV
              </button>
              <button
                type="button"
                className="button button-secondary"
                onClick={handleExportExcel}
              >
                Export Excel
              </button>
            </div>
          }
        >
          <input
            ref={importInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden-file-input"
            onChange={handleImportFile}
          />

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
                    requestedQuantity * (Number(selectedProduct.price) || 0)
                  )}
                </strong>
              </div>
              <div className="preview-row">
                <span>Stock after sale</span>
                <strong>{formatNumber(Math.max(availableQuantity - requestedQuantity, 0))}</strong>
              </div>
              {quantityError ? (
                <div className="inline-alert inline-alert-error">
                  {quantityError} Complete sale is disabled until quantity is corrected.
                </div>
              ) : null}
            </div>
          ) : (
            <EmptyState
              title="Select a product"
              description="Choose an item to see live stock, price, and order total."
            />
          )}

          <p className="muted-copy">
            Sales import columns: Customer Name, Mobile, Product or Product ID, Quantity, Date.
          </p>
        </SectionCard>
      </div>

      <div className="content-grid two-column">
        <SectionCard title="Sales by Category" eyebrow="Category Performance (Sample)">
          <div style={{ width: "100%", height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={sampleSalesCharts.categoryDistribution}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(127, 173, 187, 0.18)" />
                <XAxis dataKey="name" stroke="#9eb6c3" fontSize={12} />
                <YAxis stroke="#9eb6c3" fontSize={12} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "rgba(17, 35, 49, 0.9)",
                    border: "1px solid #ff8f3d",
                    borderRadius: "8px",
                  }}
                  formatter={(value) => `${value}%`}
                />
                <Bar dataKey="value" fill="#ff8f3d" radius={[8, 8, 0, 0]} name="Sales %" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>

        <SectionCard title="Revenue Trend" eyebrow="Daily Sale Performance (Sample)">
          <div style={{ width: "100%", height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={sampleSalesCharts.salesTrend.data}
                margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="colorSalesTrend" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ff6f61" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#ff6f61" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(127, 173, 187, 0.18)" />
                <XAxis dataKey="date" stroke="#9eb6c3" fontSize={12} />
                <YAxis stroke="#9eb6c3" fontSize={12} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "rgba(17, 35, 49, 0.9)",
                    border: "1px solid #ff6f61",
                    borderRadius: "8px",
                  }}
                  formatter={(value) => formatCurrency(value)}
                />
                <Line
                  type="monotone"
                  dataKey="sales"
                  stroke="#ff6f61"
                  dot={{ fill: "#ff6f61", r: 4 }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
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
