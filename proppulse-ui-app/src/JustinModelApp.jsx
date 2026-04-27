import React, { useEffect, useMemo, useState } from "react";

/**
 * Justin Model UI
 * - Loads Justin model JSON from /public
 * - Supports stackable filters
 * - Sortable columns
 * - Export visible rows to CSV
 * - Built as a similar UI to your main PropPulse dashboard
 *
 * Default file:
 *   /justin_model_all_players.json
 *
 * If your actual JSON file uses a different name, either:
 * 1) rename the file in /public, or
 * 2) change DEFAULT_DATA_FILE below
 */

const DEFAULT_DATA_FILE = "/justin_model_all_players.json";
const OPERATORS = [">", ">=", "<", "<=", "=", "contains"];

function toDisplayValue(value) {
  if (value === null || value === undefined) return "";
  return String(value);
}

function parseMaybeNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return value;
  const cleaned = String(value).replace(/[%,$]/g, "").trim();
  const parsed = Number(cleaned);
  return Number.isNaN(parsed) ? value : parsed;
}

function compareValues(a, b) {
  const av = parseMaybeNumber(a);
  const bv = parseMaybeNumber(b);

  const aIsNum = typeof av === "number";
  const bIsNum = typeof bv === "number";

  if (aIsNum && bIsNum) return av - bv;

  return String(av ?? "").localeCompare(String(bv ?? ""), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

export default function App() {
  const [allRows, setAllRows] = useState([]);
  const [rows, setRows] = useState([]);
  const [dataFile, setDataFile] = useState(DEFAULT_DATA_FILE);
  const [lastUpdated, setLastUpdated] = useState("");
  const [sortConfig, setSortConfig] = useState({ column: "", direction: "desc" });
  const [filters, setFilters] = useState([
    { id: 1, column: "", operator: ">", value: "" },
  ]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const columns = useMemo(() => {
    if (!allRows.length) return [];
    return Object.keys(allRows[0]);
  }, [allRows]);

  const loadData = async (file = dataFile) => {
    try {
      setLoading(true);
      setError("");
      const ts = Date.now();

      const response = await fetch(`${file}?t=${ts}`);
      if (!response.ok) {
        throw new Error(`Could not load ${file}`);
      }

      const data = await response.json();
      const safeData = Array.isArray(data) ? data : [];

      setAllRows(safeData);
      setRows(safeData);
      setLastUpdated(new Date().toLocaleString());
      setSortConfig({ column: "", direction: "desc" });
      setFilters([{ id: 1, column: "", operator: ">", value: "" }]);
    } catch (err) {
      console.error(err);
      setError(err.message || "Failed to load Justin model data.");
      setAllRows([]);
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData(DEFAULT_DATA_FILE);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const evaluateFilter = (row, filter) => {
    if (!filter.column || filter.value === "") return true;

    const rowValueRaw = row[filter.column];
    if (rowValueRaw === null || rowValueRaw === undefined || rowValueRaw === "") {
      return false;
    }

    const rowValue = parseMaybeNumber(rowValueRaw);
    const filterValue = parseMaybeNumber(filter.value);

    switch (filter.operator) {
      case ">":
        return Number(rowValue) > Number(filterValue);
      case ">=":
        return Number(rowValue) >= Number(filterValue);
      case "<":
        return Number(rowValue) < Number(filterValue);
      case "<=":
        return Number(rowValue) <= Number(filterValue);
      case "=":
        return String(rowValue).toLowerCase() === String(filterValue).toLowerCase();
      case "contains":
        return String(rowValue).toLowerCase().includes(String(filterValue).toLowerCase());
      default:
        return true;
    }
  };

  const applyFilters = () => {
    let filtered = [...allRows];
    filtered = filtered.filter((row) => filters.every((filter) => evaluateFilter(row, filter)));

    if (sortConfig.column) {
      filtered.sort((a, b) => {
        const result = compareValues(a[sortConfig.column], b[sortConfig.column]);
        return sortConfig.direction === "asc" ? result : -result;
      });
    }

    setRows(filtered);
  };

  const clearFilters = () => {
    setFilters([{ id: Date.now(), column: "", operator: ">", value: "" }]);

    let reset = [...allRows];
    if (sortConfig.column) {
      reset.sort((a, b) => {
        const result = compareValues(a[sortConfig.column], b[sortConfig.column]);
        return sortConfig.direction === "asc" ? result : -result;
      });
    }

    setRows(reset);
  };

  const addFilter = () => {
    setFilters((prev) => [
      ...prev,
      { id: Date.now() + Math.random(), column: "", operator: ">", value: "" },
    ]);
  };

  const removeFilter = (id) => {
    const updated = filters.filter((f) => f.id !== id);
    setFilters(updated.length ? updated : [{ id: Date.now(), column: "", operator: ">", value: "" }]);
  };

  const updateFilter = (id, field, value) => {
    setFilters((prev) =>
      prev.map((f) => (f.id === id ? { ...f, [field]: value } : f))
    );
  };

  const handleSort = (column) => {
    let direction = "desc";

    if (sortConfig.column === column && sortConfig.direction === "desc") {
      direction = "asc";
    }

    const sorted = [...rows].sort((a, b) => {
      const result = compareValues(a[column], b[column]);
      return direction === "asc" ? result : -result;
    });

    setSortConfig({ column, direction });
    setRows(sorted);
  };

  const exportVisibleRows = () => {
    if (!rows.length) return;

    const headers = columns;
    const csvLines = [
      headers.map((h) => `"${String(h).replace(/"/g, '""')}"`).join(","),
      ...rows.map((row) =>
        headers
          .map((header) => `"${String(row[header] ?? "").replace(/"/g, '""')}"`)
          .join(",")
      ),
    ];

    const blob = new Blob([csvLines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", "justin_model_filtered_export.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const loadPreset = (presetName) => {
    let presetFilters = [];

    if (presetName === "justinTopHits") {
      presetFilters = [
        { id: Date.now(), column: "justin_hit_score", operator: ">=", value: "80" },
        { id: Date.now() + 1, column: "projected_hits", operator: ">=", value: "1.1" },
        { id: Date.now() + 2, column: "projected_at_bats", operator: ">", value: "3.5" },
      ];
    }

    if (presetName === "justinTopTB") {
      presetFilters = [
        { id: Date.now(), column: "justin_tb_score", operator: ">=", value: "80" },
        { id: Date.now() + 1, column: "projected_total_bases", operator: ">=", value: "1.8" },
        { id: Date.now() + 2, column: "projected_at_bats", operator: ">", value: "3.5" },
      ];
    }

    setFilters(
      presetFilters.length
        ? presetFilters
        : [{ id: Date.now(), column: "", operator: ">", value: "" }]
    );
  };

  const sortIndicator = (column) => {
    if (sortConfig.column !== column) return "";
    return sortConfig.direction === "asc" ? " ▲" : " ▼";
  };

  return (
    <div
      style={{
        padding: 20,
        fontFamily: "Arial, sans-serif",
        background: "#0f172a",
        color: "#f8fafc",
        minHeight: "100vh",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
          marginBottom: 20,
        }}
      >
        <div>
          <h1 style={{ margin: 0 }}>Justin Model Dashboard</h1>
          <div style={{ marginTop: 6, color: "#cbd5e1", fontSize: 14 }}>
            Last loaded: {lastUpdated || "Loading..."}
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={() => loadData(dataFile)} style={buttonStyle}>Refresh</button>
          <button onClick={exportVisibleRows} style={buttonStyle}>Export Visible Rows</button>
          <button onClick={() => loadPreset("justinTopHits")} style={buttonStyle}>Justin Top Hits</button>
          <button onClick={() => loadPreset("justinTopTB")} style={buttonStyle}>Justin Top TB</button>
        </div>
      </div>

      <div style={panelStyle}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
          <label style={{ fontWeight: 600 }}>Data File:</label>
          <input
            value={dataFile}
            onChange={(e) => setDataFile(e.target.value)}
            style={inputStyle}
            placeholder="/justin_model_all_players.json"
          />
          <button onClick={() => loadData(dataFile)} style={buttonStyle}>Load File</button>
        </div>

        <h2 style={{ marginTop: 0 }}>Stackable Filters</h2>
        <div style={{ color: "#cbd5e1", marginBottom: 12 }}>
          Add as many filters as you want. Each rule keeps narrowing the table.
        </div>

        {filters.map((filter) => (
          <div
            key={filter.id}
            style={{
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
              alignItems: "center",
              marginBottom: 10,
            }}
          >
            <select
              value={filter.column}
              onChange={(e) => updateFilter(filter.id, "column", e.target.value)}
              style={inputStyle}
            >
              <option value="">Select Column</option>
              {columns.map((col) => (
                <option key={col} value={col}>{col}</option>
              ))}
            </select>

            <select
              value={filter.operator}
              onChange={(e) => updateFilter(filter.id, "operator", e.target.value)}
              style={inputStyle}
            >
              {OPERATORS.map((op) => (
                <option key={op} value={op}>{op}</option>
              ))}
            </select>

            <input
              type="text"
              value={filter.value}
              onChange={(e) => updateFilter(filter.id, "value", e.target.value)}
              placeholder="Value"
              style={inputStyle}
            />

            <button onClick={() => removeFilter(filter.id)} style={dangerButtonStyle}>Remove</button>
          </div>
        ))}

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
          <button onClick={addFilter} style={buttonStyle}>Add Filter</button>
          <button onClick={applyFilters} style={buttonStyle}>Apply Filters</button>
          <button onClick={clearFilters} style={buttonStyle}>Clear Filters</button>
        </div>
      </div>

      {loading && <div style={{ marginTop: 20 }}>Loading Justin model data...</div>}
      {error && <div style={{ marginTop: 20, color: "#fca5a5" }}>Error: {error}</div>}

      <div style={{ marginTop: 16, color: "#cbd5e1" }}>
        Showing {rows.length.toLocaleString()} of {allRows.length.toLocaleString()} rows
      </div>

      <div
        style={{
          marginTop: 14,
          overflowX: "auto",
          border: "1px solid #334155",
          borderRadius: 12,
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse", background: "#111827" }}>
          <thead>
            <tr>
              {columns.map((column) => (
                <th
                  key={column}
                  onClick={() => handleSort(column)}
                  style={{
                    position: "sticky",
                    top: 0,
                    background: "#1e293b",
                    color: "#f8fafc",
                    borderBottom: "1px solid #334155",
                    padding: "10px 8px",
                    textAlign: "left",
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                    fontSize: 13,
                  }}
                >
                  {column}{sortIndicator(column)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex} style={{ borderBottom: "1px solid #1f2937" }}>
                {columns.map((column) => (
                  <td
                    key={`${rowIndex}-${column}`}
                    style={{
                      padding: "8px",
                      fontSize: 13,
                      whiteSpace: "nowrap",
                      color: "#e5e7eb",
                    }}
                  >
                    {toDisplayValue(row[column])}
                  </td>
                ))}
              </tr>
            ))}

            {!loading && !rows.length && (
              <tr>
                <td
                  colSpan={Math.max(columns.length, 1)}
                  style={{ padding: 20, textAlign: "center", color: "#cbd5e1" }}
                >
                  No rows match the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const panelStyle = {
  background: "#1e293b",
  border: "1px solid #334155",
  borderRadius: 12,
  padding: 16,
};

const inputStyle = {
  background: "#0f172a",
  color: "#f8fafc",
  border: "1px solid #475569",
  borderRadius: 8,
  padding: "8px 10px",
  minWidth: 180,
};

const buttonStyle = {
  background: "#2563eb",
  color: "#ffffff",
  border: "none",
  borderRadius: 8,
  padding: "9px 12px",
  cursor: "pointer",
  fontWeight: 600,
};

const dangerButtonStyle = {
  ...buttonStyle,
  background: "#dc2626",
};
