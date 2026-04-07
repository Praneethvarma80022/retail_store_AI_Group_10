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
  name: "",
  category: "General",
  sku: "",
  reorderLevel: "5",
  quantity: "",
  price: "",
};

export default function InventoryPage() {
  const [products, setProducts] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [editingId, setEditingId] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null);

  const deferredSearch = useDeferredValue(search);

  async function loadProducts() {
    setLoading(true);

    try {
      const response = await api.get("/store");
      setProducts(response.data);
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

  function handleExport() {
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
            <button type="button" className="button button-secondary" onClick={handleExport}>
              Export CSV
            </button>
          }
        >
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
