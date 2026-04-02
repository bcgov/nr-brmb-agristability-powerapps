import { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import type { Vsi_participantprogramyears } from "./generated/models/Vsi_participantprogramyearsModel";
import { FARMSAPIService } from "./generated/services/FARMSAPIService";
import { Vsi_participantprogramyearsService } from "./generated/services/Vsi_participantprogramyearsService";


function App() {
  type FarmsRow = Record<string, unknown>;
  type DataverseRow = Vsi_participantprogramyears & Record<string, unknown>;
  type SortDirection = "asc" | "desc";
  type EnrollmentColumnId =
    | "pin"
    | "producerName"
    | "year"
    | "taskStatus"
    | "enrolStatus"
    | "calculatedFee"
    | "lastAction"
    | "sharepoint";

  type EnrollmentColumn = {
    id: EnrollmentColumnId;
    header: string;
    getDisplay: (row: Vsi_participantprogramyears) => string;
    getSortValue: (row: Vsi_participantprogramyears) => string | number;
  };

  const [rows, setRows] = useState<Vsi_participantprogramyears[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sortColumn, setSortColumn] = useState<EnrollmentColumnId>("lastAction");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [selectedRowKeys, setSelectedRowKeys] = useState<Set<string>>(new Set());
  const selectAllCheckboxRef = useRef<HTMLInputElement | null>(null);

  const [farmsData, setFarmsData] = useState<FarmsRow[]>([]);
  const [farmsRaw, setFarmsRaw] = useState<string>("");
  const [farmsLoading, setFarmsLoading] = useState(false);
  const [farmsError, setFarmsError] = useState("");

  useEffect(() => {
    let cancelled = false;

    const loadEnrollments = async () => {
      try {
        setLoading(true);
        setError("");
        const baseQuery = {
          orderBy: ["modifiedon desc"],
          top : 200,
          select: [
            "vsi_name",
            "_vsi_participantid_value",
            "_vsi_programyearid_value",
            "vsi_enrolmentstatus",
            "vsi_taskstatus",
            "vsi_calculatedenfee",
            "vsi_sharepointdocumentfolder",
            "modifiedon",
          ],
        };

        const allRows: Vsi_participantprogramyears[] = [];
        let skipToken: string | undefined = undefined;

        do {
          const result = await Vsi_participantprogramyearsService.getAll({
            ...baseQuery,
            skipToken,
          });

          if (!result?.success) {
            throw result.error ?? new Error("Dataverse query not successful");
          }

          allRows.push(...(result.data ?? []));
          skipToken = result.skipToken;
        } while (skipToken);

        if (!cancelled) {
          setRows(allRows);
          setSelectedRowKeys(new Set());
        }
      } catch (err: unknown) {
        console.error(err);
        let errMsg = "";
        if (err instanceof Error) {
          errMsg = err.message;
        } else if (typeof err === "string") {
          errMsg = err;
        } else if (err !== null && err !== undefined) {
          errMsg = JSON.stringify(err);
        }
        if (!cancelled) {
          setError(errMsg || "Failed to load enrollment records.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadEnrollments();

    return () => {
      cancelled = true;
    };
  }, []);

  const normalizeFarmsRows = (payload: unknown): FarmsRow[] => {
    const isRow = (value: unknown): value is FarmsRow =>
      typeof value === "object" && value !== null && !Array.isArray(value);

    if (Array.isArray(payload)) {
      return payload.filter(isRow);
    }

    if (isRow(payload) && Array.isArray(payload.items)) {
      return payload.items.filter(isRow);
    }

    return [];
  };

  const formatFarmsPayload = (payload: unknown): string => {
    if (typeof payload === "string") {
      return payload;
    }

    if (payload == null) {
      return "";
    }

    return JSON.stringify(payload, null, 2);
  };

  const getFormattedValue = (row: DataverseRow, field: string) => {
    const value = row[`${field}@OData.Community.Display.V1.FormattedValue`];
    return value === undefined || value === null ? "" : String(value);
  };

  const parseNumber = (value: unknown) => {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value !== "string") return Number.NaN;

    const normalized = value.replace(/[^0-9.-]/g, "");
    if (!normalized) return Number.NaN;

    return Number(normalized);
  };

  const getRowKey = (row: Vsi_participantprogramyears) => {
    const fallback = `${row.vsi_name ?? "row"}-${row.modifiedon ?? ""}-${row.vsi_calculatedenfee ?? ""}`;
    return String(row.vsi_participantprogramyearid ?? row._vsi_participantid_value ?? row.ownerid ?? fallback);
  };

  const formatCurrency = (value: unknown) => {
    const parsed = parseNumber(value);
    if (Number.isNaN(parsed)) return "";
    return `$${parsed.toFixed(2)}`;
  };

  const formatDateTime = (value: unknown) => {
    if (typeof value !== "string" || !value) return "";
    const parsed = Date.parse(value);
    if (Number.isNaN(parsed)) return value;

    return new Date(parsed).toLocaleString();
  };

  const compareValues = (a: string | number, b: string | number) => {
    if (typeof a === "number" && typeof b === "number") {
      return a - b;
    }

    return String(a).localeCompare(String(b), undefined, {
      numeric: true,
      sensitivity: "base",
    });
  };

  const toggleSort = (columnId: EnrollmentColumnId) => {
    if (sortColumn === columnId) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }

    setSortColumn(columnId);
    setSortDirection("asc");
  };

  const callFarmsApi = async () => {
    setFarmsLoading(true);
    setFarmsError("");
    setFarmsRaw("");
    setFarmsData([]);

    try {
      const result = (await FARMSAPIService.GetBenchmarkPerUnitsByProgramYear(2025)) as {
        success?: boolean;
        data?: unknown;
        error?: unknown;
      };

      if (!result?.success) {
        throw result.error ?? new Error("FARMS connector query not successful");
      }

      const payload = result.data;
      setFarmsRaw(formatFarmsPayload(payload));
      setFarmsData(normalizeFarmsRows(payload));
    } catch (err: unknown) {
      let errMsg = "";
      if (err instanceof Error) errMsg = err.message;
      else if (typeof err === "string") errMsg = err;
      else if (err != null) errMsg = JSON.stringify(err);
      setFarmsError(errMsg || "Failed to load FARMS data");
    } finally {
      setFarmsLoading(false);
    }
  };

  const columns: EnrollmentColumn[] = [
    {
      id: "pin",
      header: "PIN",
      getDisplay: (row) => String(row.vsi_name ?? ""),
      getSortValue: (row) => String(row.vsi_name ?? ""),
    },
    {
      id: "producerName",
      header: "Producer name",
      getDisplay: (row) =>
        String(
          getFormattedValue(row as DataverseRow, "_vsi_participantid_value") ||
          row.vsi_participantidname ||
          row._vsi_participantid_value ||
          ""
        ),
      getSortValue: (row) =>
        getFormattedValue(row as DataverseRow, "_vsi_participantid_value") ||
        row.vsi_participantidname ||
        row._vsi_participantid_value ||
        "",
    },
    {
      id: "year",
      header: "Year",
      getDisplay: (row) =>
        String(
          getFormattedValue(row as DataverseRow, "_vsi_programyearid_value") ||
          row.vsi_programyearidname ||
          row._vsi_programyearid_value ||
          ""
        ),
      getSortValue: (row) =>
        getFormattedValue(row as DataverseRow, "_vsi_programyearid_value") ||
        row.vsi_programyearidname ||
        row._vsi_programyearid_value ||
        "",
    },
    {
      id: "taskStatus",
      header: "Task Status",
      getDisplay: (row) =>
        String(
          getFormattedValue(row as DataverseRow, "vsi_taskstatus") ||
          row.vsi_taskstatusname ||
          row.vsi_taskstatus ||
          ""
        ),
      getSortValue: (row) =>
        getFormattedValue(row as DataverseRow, "vsi_taskstatus") ||
        row.vsi_taskstatusname ||
        row.vsi_taskstatus ||
        "",
    },
    {
      id: "enrolStatus",
      header: "Enrol status",
      getDisplay: (row) =>
        String(
          getFormattedValue(row as DataverseRow, "vsi_enrolmentstatus") ||
          row.vsi_enrolmentstatusname ||
          row.vsi_enrolmentstatus ||
          ""
        ),
      getSortValue: (row) =>
        getFormattedValue(row as DataverseRow, "vsi_enrolmentstatus") ||
        row.vsi_enrolmentstatusname ||
        row.vsi_enrolmentstatus ||
        "",
    },
    {
      id: "calculatedFee",
      header: "Calculated fee",
      getDisplay: (row) => formatCurrency(row.vsi_calculatedenfee),
      getSortValue: (row) => {
        const parsed = parseNumber(row.vsi_calculatedenfee);
        return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
      },
    },
    {
      id: "lastAction",
      header: "Last Action",
      getDisplay: (row) => formatDateTime(row.modifiedon),
      getSortValue: (row) => {
        const parsed = Date.parse(String(row.modifiedon ?? ""));
        return Number.isNaN(parsed) ? 0 : parsed;
      },
    },
    {
      id: "sharepoint",
      header: "Sharepoint",
      getDisplay: (row) => String(row.vsi_sharepointdocumentfolder ?? ""),
      getSortValue: (row) => String(row.vsi_sharepointdocumentfolder ?? ""),
    },
  ];

  const sortedRows = useMemo(() => {
    const activeColumn = columns.find((column) => column.id === sortColumn);
    if (!activeColumn) return rows;

    const directionMultiplier = sortDirection === "asc" ? 1 : -1;

    return [...rows].sort((left, right) => {
      const leftValue = activeColumn.getSortValue(left);
      const rightValue = activeColumn.getSortValue(right);
      return compareValues(leftValue, rightValue) * directionMultiplier;
    });
  }, [rows, sortColumn, sortDirection]);

  const rowKeys = useMemo(() => sortedRows.map((row) => getRowKey(row)), [sortedRows]);
  const allRowsSelected = rowKeys.length > 0 && rowKeys.every((rowKey) => selectedRowKeys.has(rowKey));
  const someRowsSelected = rowKeys.some((rowKey) => selectedRowKeys.has(rowKey));

  useEffect(() => {
    if (!selectAllCheckboxRef.current) return;
    selectAllCheckboxRef.current.indeterminate = someRowsSelected && !allRowsSelected;
  }, [allRowsSelected, someRowsSelected]);

  const toggleRowSelection = (rowKey: string) => {
    setSelectedRowKeys((previous) => {
      const next = new Set(previous);
      if (next.has(rowKey)) {
        next.delete(rowKey);
      } else {
        next.add(rowKey);
      }
      return next;
    });
  };

  const toggleSelectAllRows = (checked: boolean) => {
    if (checked) {
      setSelectedRowKeys(new Set(rowKeys));
      return;
    }
    setSelectedRowKeys(new Set());
  };

  return (
    <div className="dashboard-shell">
      <h1 className="dashboard-title">Enrolment Dashboard</h1>
      {!loading && !error && <p className="record-count">Total records loaded: {rows.length}</p>}
      {loading ? (
        <p>Loading enrollment records...</p>
      ) : error ? (
        <p className="error-text">{error}</p>
      ) : rows.length === 0 ? (
        <p>No records found.</p>
      ) : (
        <div className="table-card">
          <div className="table-wrap">
            <table className="enrolment-table">
              <thead>
                <tr>
                  <th className="selection-cell">
                    <input
                      ref={selectAllCheckboxRef}
                      type="checkbox"
                      checked={allRowsSelected}
                      onChange={(event) => toggleSelectAllRows(event.target.checked)}
                      className="table-checkbox select-all-checkbox"
                      aria-label="Select all rows"
                    />
                  </th>
                  {columns.map((column) => {
                    const isActive = sortColumn === column.id;
                    return (
                      <th key={column.id}>
                        <button
                          type="button"
                          className={`sort-btn ${isActive ? "active" : ""}`}
                          onClick={() => toggleSort(column.id)}
                        >
                          <span
                            className={`sort-glyph ${isActive ? `active ${sortDirection}` : ""}`}
                            aria-hidden="true"
                          >
                            <span className="caret up" />
                            <span className="caret down" />
                          </span>
                          <span>{column.header}</span>
                        </button>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((row) => {
                  const keyValue = getRowKey(row);
                  const isSelected = selectedRowKeys.has(keyValue);

                  return (
                    <tr key={String(keyValue)}>
                      <td className="selection-cell">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleRowSelection(keyValue)}
                          className="table-checkbox row-checkbox"
                          aria-label={`Select row ${keyValue}`}
                        />
                      </td>
                      {columns.map((column) => {
                        const value = column.getDisplay(row);

                        if (column.id === "sharepoint") {
                          return (
                            <td key={column.id}>
                              {value ? (
                                <a href={value} target="_blank" rel="noreferrer" className="sharepoint-link">
                                  sharepint
                                </a>
                              ) : (
                                <span className="empty-value">-</span>
                              )}
                            </td>
                          );
                        }

                        return (
                          <td key={column.id}>
                            {value || <span className="empty-value">-</span>}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <section className="secondary-panel">
        <h2>FARMS Connector Result</h2>
        {farmsLoading && <p>Loading FARMS connector data...</p>}
        {farmsError && <p className="error-text">{farmsError}</p>}
        {!farmsLoading && !farmsError && !farmsRaw && farmsData.length === 0 && <p>No FARMS data yet.</p>}

        {farmsData.length > 0 && (
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              marginTop: "12px",
            }}
          >
            <thead>
              <tr>
                {Object.keys(farmsData[0]).map((col) => (
                  <th
                    key={col}
                    style={{ border: "1px solid #ccc", padding: "8px", backgroundColor: "#f5f5f5" }}
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {farmsData.map((row, idx) => (
                <tr key={idx}>
                  {Object.keys(farmsData[0]).map((col) => (
                    <td key={col} style={{ border: "1px solid #ccc", padding: "8px" }}>
                      {String(row[col] ?? "")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="secondary-panel">
        <h2>FARMS CheckHealth</h2>
        <div className="health-actions">
          <button onClick={callFarmsApi} disabled={farmsLoading} className="health-btn">
            {farmsLoading ? "Loading..." : "Call FARMS CheckHealth"}
          </button>
        </div>

        <div className="health-output">
          {farmsError ? (
            <span className="error-text">{farmsError}</span>
          ) : farmsLoading ? (
            "Calling FARMS connector..."
          ) : farmsData.length > 0 ? (
            <code>{JSON.stringify(farmsData, null, 2)}</code>
          ) : farmsRaw ? (
            <code>{farmsRaw}</code>
          ) : (
            "No FARMS data yet. Click Call FARMS CheckHealth."
          )}
        </div>
      </section>

    </div>
  );
}

export default App;
