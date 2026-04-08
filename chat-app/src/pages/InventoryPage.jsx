import { useDeferredValue, useEffect, useRef, useState } from "react";
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
import StatusPill from "../components/StatusPill";
import api, { getErrorMessage } from "../lib/api";
import { downloadCsv, downloadExcel, parseCsv } from "../lib/exporters";
import {
  formatCurrency,
  formatDate,
  formatNumber,
} from "../lib/formatters";
import { mapInventoryImportRows } from "../lib/importers";

const initialForm = {
  name: "",
  category: "General",
  sku: "",
  reorderLevel: "5",
  quantity: "",
  price: "",
};

// Sample data for inventory visualization
const sampleInventoryCharts = {
  categoryDistribution: [
    { name: "Beauty", count: 12 },
    { name: "Clothing", count: 18 },
    { name: "Electronics", count: 14 },
    { name: "Accessories", count: 8 }
  ],
  stockStatusDistribution: [
    { name: "Healthy", value: 35 },
    { name: "Low Stock", value: 18 },
    { name: "Out of Stock", value: 5 },
    { name: "Critical", value: 2 }
  ]
};

export default function InventoryPage() {
  const importInputRef = useRef(null);
  const [products, setProducts] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [editingId, setEditingId] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [notice, setNotice] = useState(null);

  const deferredSearch = useDeferredValue(search);

  async function loadProducts() {
    setLoading(true);

    try {
      const storeResponse = await api.get("/store");
      setProducts(storeResponse.data);
    } catch (error) {
      setNotice({
        type: "error",
        text: getErrorMessage(error, "Unable to load inventory."),
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadProducts();
  }, []);

  const filteredProducts = products.filter((product) => {
    const matchesSearch = product.name
      .toLowerCase()
      .includes(deferredSearch.trim().toLowerCase());
    const matchesStatus =
      statusFilter === "all" ? true : product.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const inventoryValue = products.reduce(
    (sum, product) => sum + (product.totalValue || 0),
    0
  );
  const lowStockCount = products.filter(
    (product) =>
      product.status === "low-stock" || product.status === "out-of-stock"
  ).length;

  function resetForm() {
    setForm(initialForm);
    setEditingId("");
  }

  function handleFormChange(event) {
    const { name, value } = event.target;
    setForm((current) => ({
      ...current,
      [name]: value,
    }));
  }

  function handleEdit(product) {
    setForm({
      name: product.name,
      category: product.category || "General",
      sku: product.sku || "",
      reorderLevel: String(product.reorderLevel ?? 5),
      quantity: String(product.quantity),
      price: String(product.price),
    });
    setEditingId(product.id);
    setNotice(null);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setNotice(null);

    try {
      if (editingId) {
        await api.put(`/store/${editingId}`, form);
        setNotice({
          type: "success",
          text: "Product details updated successfully.",
        });
      } else {
        const response = await api.post("/store", form);
        const action = response.data?.action === "restocked" ? "restocked" : "created";
        setNotice({
          type: "success",
          text:
            action === "restocked"
              ? "Existing product was restocked and updated."
              : "Product added to inventory.",
        });
      }

      resetForm();
      await loadProducts();
    } catch (error) {
      setNotice({
        type: "error",
        text: getErrorMessage(error, "Unable to save inventory changes."),
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(product) {
    const confirmed = window.confirm(`Delete ${product.name} from inventory?`);
    if (!confirmed) return;

    try {
      await api.delete(`/store/${product.id}`);
      setNotice({
        type: "success",
        text: `${product.name} was removed from inventory.`,
      });
      await loadProducts();
    } catch (error) {
      setNotice({
        type: "error",
        text: getErrorMessage(error, "Unable to delete this product."),
      });
    }
  }

  function handleExportCsv() {
    downloadCsv(
      "inventory-report.csv",
      [
        "Product",
        "Category",
        "SKU",
        "Reorder Level",
        "Quantity",
        "Price",
        "Inventory Value",
        "Status",
        "Updated At",
      ],
      filteredProducts.map((product) => [
        product.name,
        product.category,
        product.sku,
        product.reorderLevel,
        product.quantity,
        product.price,
        product.totalValue,
        product.status,
        formatDate(product.updatedAt),
      ])
    );
  }

  function handleExportExcel() {
    downloadExcel(
      "inventory-report.xls",
      [
        "Product",
        "Category",
        "SKU",
        "Reorder Level",
        "Quantity",
        "Price",
        "Inventory Value",
        "Status",
        "Updated At",
      ],
      filteredProducts.map((product) => [
        product.name,
        product.category,
        product.sku,
        product.reorderLevel,
        product.quantity,
        product.price,
        product.totalValue,
        product.status,
        formatDate(product.updatedAt),
      ]),
      "Inventory"
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
      const mappedRows = mapInventoryImportRows(rows);

      if (!mappedRows.length) {
        throw new Error("The selected CSV file does not contain import rows.");
      }

      const response = await api.post("/store/import", {
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
          `Inventory import finished. ${summary.created || 0} created, ${summary.restocked || 0} restocked.`,
          summary.errors?.length
            ? `${summary.errors.length} row(s) failed. ${errorLines}`
            : "All rows were processed successfully.",
        ].join(" "),
      });
      await loadProducts();
    } catch (error) {
      setNotice({
        type: "error",
        text: getErrorMessage(error, "Unable to import inventory CSV."),
      });
    } finally {
      setImporting(false);
    }
  }

  if (loading) {
    return <LoadingState title="Loading inventory studio..." />;
  }

  return (
    <div className="page-stack">
      <div className="metric-grid">
        <MetricCard
          label="Catalog Size"
          value={formatNumber(products.length)}
          caption="Tracked products in the current catalog"
          tone="inventory"
        />
        <MetricCard
          label="Inventory Value"
          value={formatCurrency(inventoryValue)}
          caption="Current retail value of stock on hand"
          tone="revenue"
        />
        <MetricCard
          label="Low Stock"
          value={formatNumber(lowStockCount)}
          caption="Items that need restocking attention"
          tone="attention"
        />
      </div>

      {notice ? (
        <div className={`alert-banner alert-${notice.type}`}>{notice.text}</div>
      ) : null}

      <div className="content-grid two-column">
        <SectionCard
          title={editingId ? "Edit inventory item" : "Add or restock item"}
          eyebrow="Inventory Form"
        >
          <form className="form-grid" onSubmit={handleSubmit}>
            <label className="field-group">
              <span className="field-label">Product name</span>
              <input
                list="product-name-suggestions"
                name="name"
                value={form.name}
                onChange={handleFormChange}
                placeholder="Example: Wireless Mouse"
                className="field-input"
              />
            </label>

            <label className="field-group">
              <span className="field-label">Category</span>
              <select
                name="category"
                value={form.category}
                onChange={handleFormChange}
                className="field-input"
              >
                <option value="General">General</option>
                <option value="Power">Power</option>
                <option value="Protection">Protection</option>
                <option value="Audio">Audio</option>
                <option value="Accessories">Accessories</option>
              </select>
            </label>

            <label className="field-group">
              <span className="field-label">SKU</span>
              <input
                name="sku"
                value={form.sku}
                onChange={handleFormChange}
                placeholder="Auto-generated if left blank"
                className="field-input"
              />
            </label>

            <label className="field-group">
              <span className="field-label">Reorder level</span>
              <input
                name="reorderLevel"
                type="number"
                min="0"
                value={form.reorderLevel}
                onChange={handleFormChange}
                className="field-input"
              />
            </label>

            <label className="field-group">
              <span className="field-label">Quantity</span>
              <input
                name="quantity"
                type="number"
                min="0"
                value={form.quantity}
                onChange={handleFormChange}
                placeholder="0"
                className="field-input"
              />
            </label>

            <label className="field-group">
              <span className="field-label">Unit price</span>
              <input
                name="price"
                type="number"
                min="0"
                step="0.01"
                value={form.price}
                onChange={handleFormChange}
                placeholder="0"
                className="field-input"
              />
            </label>

            <div className="button-row">
              <button type="submit" className="button button-primary" disabled={saving}>
                {saving ? "Saving..." : editingId ? "Save changes" : "Add to inventory"}
              </button>
              {editingId ? (
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={resetForm}
                >
                  Cancel edit
                </button>
              ) : null}
            </div>
          </form>

          <datalist id="product-name-suggestions">
            {products.map((product) => (
              <option key={product.id} value={product.name} />
            ))}
          </datalist>
        </SectionCard>

        <SectionCard
          title="Inventory filters"
          eyebrow="Control View"
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
              <button
                type="button"
                className="button button-secondary"
                onClick={handleExportCsv}
              >
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

          <div className="filter-grid">
            <label className="field-group">
              <span className="field-label">Search products</span>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by product name"
                className="field-input"
              />
            </label>

            <label className="field-group">
              <span className="field-label">Status</span>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className="field-input"
              >
                <option value="all">All items</option>
                <option value="healthy">Healthy</option>
                <option value="low-stock">Low stock</option>
                <option value="out-of-stock">Out of stock</option>
              </select>
            </label>
          </div>

          <div className="tag-row">
            <span className="meta-pill">{filteredProducts.length} visible items</span>
            <span className="meta-pill">Search updates stay responsive</span>
          </div>

          <p className="muted-copy">
            Inventory import columns: Product, Category, SKU, Reorder Level, Quantity, Price.
          </p>
        </SectionCard>
      </div>

      <div className="content-grid two-column">
        <SectionCard title="Products by Category" eyebrow="Category Breakdown (Sample)">
          <div style={{ width: "100%", height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={sampleInventoryCharts.categoryDistribution}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(127, 173, 187, 0.18)" />
                <XAxis dataKey="name" stroke="#9eb6c3" fontSize={12} />
                <YAxis stroke="#9eb6c3" fontSize={12} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "rgba(17, 35, 49, 0.9)",
                    border: "1px solid #38c7b3",
                    borderRadius: "8px",
                  }}
                  formatter={(value) => `${value} products`}
                />
                <Bar dataKey="count" fill="#38c7b3" radius={[8, 8, 0, 0]} name="Product Count" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>

        <SectionCard title="Stock Status" eyebrow="Inventory Health (Sample)">
          <div style={{ width: "100%", height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={sampleInventoryCharts.stockStatusDistribution}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, value }) => `${name}: ${value}`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {sampleInventoryCharts.stockStatusDistribution.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={["#38c7b3", "#ff8f3d", "#ff6f61", "#9eb6c3"][index % 4]}
                    />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => `${value} items`} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Inventory catalog" eyebrow="Live Stock Table">
        {filteredProducts.length ? (
          <div className="data-table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Category</th>
                  <th>SKU</th>
                  <th>Status</th>
                  <th>Reorder Level</th>
                  <th>Quantity</th>
                  <th>Unit Price</th>
                  <th>Inventory Value</th>
                  <th>Updated</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map((product) => (
                  <tr key={product.id}>
                    <td>
                      <div className="table-primary">
                        <strong>{product.name}</strong>
                      </div>
                    </td>
                    <td>{product.category}</td>
                    <td>{product.sku}</td>
                    <td>
                      <StatusPill value={product.status} />
                    </td>
                    <td>{formatNumber(product.reorderLevel)}</td>
                    <td>{formatNumber(product.quantity)}</td>
                    <td>{formatCurrency(product.price)}</td>
                    <td>{formatCurrency(product.totalValue)}</td>
                    <td>{formatDate(product.updatedAt)}</td>
                    <td>
                      <div className="table-actions">
                        <button
                          type="button"
                          className="button button-ghost"
                          onClick={() => handleEdit(product)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="button button-danger"
                          onClick={() => handleDelete(product)}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title="No products match this view"
            description="Try another search or add a new product to start the catalog."
          />
        )}
      </SectionCard>
    </div>
  );
}
