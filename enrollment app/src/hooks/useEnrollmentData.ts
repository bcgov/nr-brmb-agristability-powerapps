import { useEffect, useState } from "react";
import type { IGetAllOptions } from "../generated/models/CommonModels";
import type { Vsi_participantprogramyears } from "../generated/models/Vsi_participantprogramyearsModel";
import { Vsi_participantprogramyearsService } from "../generated/services/Vsi_participantprogramyearsService";
import type { EnrollmentRecord } from "../types/enrollment";
import { mapDataverseEnrollment } from "../utils/enrollmentMapper";

const QUERY_OPTIONS: IGetAllOptions = {
  orderBy: ["modifiedon desc"],
  maxPageSize: 500,
  select: [
    "vsi_participantprogramyearid",
    "vsi_name",
    "_vsi_participantid_value",
    "_vsi_programyearid_value",
    "vsi_enrolmentstatus",
    "vsi_taskstatus",
    "vsi_calculatedenfee",
    "vsi_sharepointdocumentfolder",
    "modifiedon",
    "vsi_checkfordatafix",
    "vsi_datafixapplied",
    "vsi_haspartners",
    "vsi_incombinedfarm",
    "vsi_partnershippins",
    "vsi_combinedfarmpins",
  ],
};

export const useEnrollmentData = () => {
  const [rows, setRows] = useState<EnrollmentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    const loadEnrollments = async () => {
      try {
        setLoading(true);
        setError("");

        const allRawRows: Vsi_participantprogramyears[] = [];
        const seenTokens = new Set<string>();
        let skipToken: string | undefined;

        while (true) {
          const result = await Vsi_participantprogramyearsService.getAll({
            ...QUERY_OPTIONS,
            skipToken,
          });

          if (!result.success) {
            throw result.error ?? new Error("Dataverse query not successful");
          }

          allRawRows.push(...(result.data ?? []));

          if (!result.skipToken || seenTokens.has(result.skipToken)) {
            break;
          }

          seenTokens.add(result.skipToken);
          skipToken = result.skipToken;
        }

        if (!cancelled) {
          setRows(allRawRows.map(mapDataverseEnrollment));
        }
      } catch (err: unknown) {
        if (!cancelled) {
          if (err instanceof Error) {
            setError(err.message);
          } else if (typeof err === "string") {
            setError(err);
          } else {
            setError("Failed to load enrolment records.");
          }
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

  return { rows, loading, error };
};

