import { useEffect, useState } from "react";
import "./App.css";
import type { Vsi_participantprogramyears } from "./generated/models/Vsi_participantprogramyearsModel";
import { FARMSAPIService } from "./generated/services/FARMSAPIService";
import { Vsi_participantprogramyearsService } from "./generated/services/Vsi_participantprogramyearsService";


function App() {
  type FarmsRow = Record<string, unknown>;

  const [rows, setRows] = useState<Vsi_participantprogramyears[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [farmsData, setFarmsData] = useState<FarmsRow[]>([]);
  const [farmsRaw, setFarmsRaw] = useState<string>("");
  const [farmsLoading, setFarmsLoading] = useState(false);
  const [farmsError, setFarmsError] = useState("");

  useEffect(() => {
    const loadEnrollments = async () => {
      try {
        setLoading(true);
        setError("");

        const result = await Vsi_participantprogramyearsService.getAll({
          top: 20,
          select: [
            "vsi_name",
            "vsi_participantid",
            "vsi_programyearid",
            "vsi_enrolmentstatus",
            "vsi_taskstatus",
            "vsi_calculatedenfee",
            "vsi_sharepointdocumentfolder",
            "modifiedon",
          ],
        });

        if (!result?.success) {
          throw result.error ?? new Error("Dataverse query not successful");
        }

        setRows(result?.data ?? []);
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
        setError(errMsg || "Failed to load enrollment records.");
      } finally {
        setLoading(false);
      }
    };

    loadEnrollments();
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

  if (loading) {
    return <div style={{ padding: "24px" }}>Loading enrollment records...</div>;
  }

  if (error) {
    return (
      <div style={{ padding: "24px" }}>
        <h2>Error</h2>
        <p>{error}</p>
      </div>
    );
  }

  type ColumnField =
    | "vsi_name"
    | "vsi_participantid"
    | "vsi_programyearid"
    | "vsi_enrolmentstatus"
    | "vsi_taskstatus"
    | "vsi_calculatedenfee"
    | "vsi_sharepointdocumentfolder"
    | "modifiedon";

  const columns: Array<{ header: string; field: ColumnField }> = [
    { header: "PIN", field: "vsi_name" },
    { header: "Producer Name", field: "vsi_participantid" },
    { header: "Year", field: "vsi_programyearid" },
    { header: "Enrol Status", field: "vsi_enrolmentstatus" },
    { header: "Task Status", field: "vsi_taskstatus" },
    { header: "Calculated Fee", field: "vsi_calculatedenfee" },
    { header: "SharePoint Doc", field: "vsi_sharepointdocumentfolder" },
    { header: "Last Action", field: "modifiedon" },
  ];

  return (
    <div style={{ padding: "24px" }}>
      <h1>Enrolment Dashboard</h1>

      {rows.length === 0 ? (
        <p>No records found.</p>
      ) : (
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            marginTop: "16px",
          }}
        >
          <thead>
            <tr>
              {columns.map((col) => (
                <th
                  key={col.field}
                  style={{
                    border: "1px solid #ccc",
                    padding: "8px",
                    textAlign: "left",
                    backgroundColor: "#f5f5f5",
                  }}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const keyValue = row.vsi_participantprogramyearid ?? row.ownerid ?? row.vsi_participantid ?? "row-" + Math.random();
              return (
                <tr key={String(keyValue)}>
                  {columns.map((col) => {
                    const value = row[col.field];
                    return (
                      <td
                        key={col.field}
                        style={{
                          border: "1px solid #ccc",
                          padding: "8px",
                          verticalAlign: "top",
                        }}
                      >
                        {value === undefined || value === null ? "" : String(value)}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <section style={{ marginTop: "36px" }}>
        <h2>FARMS Connector Result</h2>
        {farmsLoading && <p>Loading FARMS connector data...</p>}
        {farmsError && <p style={{ color: "red" }}>{farmsError}</p>}
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

      <section style={{ marginTop: "36px" }}>
        <h2>FARMS CheckHealth</h2>
        <div style={{ marginBottom: "10px", display: "flex", gap: "12px", alignItems: "center" }}>
          <button onClick={callFarmsApi} disabled={farmsLoading} style={{ padding: "8px 14px" }}>
            {farmsLoading ? "Loading..." : "Call FARMS CheckHealth"}
          </button>
        </div>

        <div
          style={{
            border: "1px solid #ccc",
            borderRadius: "8px",
            padding: "12px",
            backgroundColor: "#fafafa",
            minHeight: "120px",
            whiteSpace: "pre-wrap",
            fontFamily: "monospace",
            fontSize: "13px",
            overflow: "auto",
          }}
        >
          {farmsError ? (
            <span style={{ color: "#b00020" }}>{farmsError}</span>
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
