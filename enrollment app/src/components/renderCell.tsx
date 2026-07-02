import { Link } from 'react-router-dom';
import { Flag, Calculator } from 'lucide-react';
import sharepointIconUrl from '/icons/sharepoint.svg?url';
import type { Vsi_participantprogramyears } from '../generated/models/Vsi_participantprogramyearsModel';
import {
  Vsi_participantprogramyearsvsi_enrollmentregionaloffice,
  Vsi_participantprogramyearsvsi_farmingsector,
} from '../generated/models/Vsi_participantprogramyearsModel';
import { CORE_APP_ID_FALLBACK, CORE_BASE_URL_FALLBACK } from '../constants/config';
import type { SortKey } from '../types/enrollment';
import { getEnrolmentEnFeeVarianceThreshold } from '../constants/varianceThreshold';
import {
  getEnrolmentStatusLabel, getTaskStatusLabel, taskStatusIcon,
  formatCurrency, getInitials, getAvatarColor,
  getVarianceClass, formatVariancePercent, formatEnrolmentStatusDisplay,
} from '../utils/helpers';

type RowWithSource = Vsi_participantprogramyears & { _source?: string };

export function renderCell(
  key: SortKey,
  row: Vsi_participantprogramyears,
  raw: Record<string, unknown>,
  avatarUrls: Record<string, string>,
  coreAppId: string | null,
  coreBaseUrl: string | null,
) {
  const resolvedCoreBaseUrl = coreBaseUrl?.trim() || CORE_BASE_URL_FALLBACK;
  const yesNo = (v: unknown) => (v === 1 || v === true) ? 'Yes' : (v === 0 || v === false) ? 'No' : '';
  const enumLabel = (map: Record<number, string>, v: unknown) =>
    v != null ? map[Number(v)] ?? String(v) : '';
  const fmtDate = (v: unknown) => { if (!v) return ''; try { return new Date(v as string).toLocaleDateString(); } catch { return String(v); } };
  const source = (row as RowWithSource)._source ?? 'dashboard';
  switch (key) {
    case 'pin': {
      return (
        <td key={key} className="cell-pin">
          {row.vsi_participantprogramyearid
            ? <Link className="cell-pin-link" to={`/enrolment/${source}/${row.vsi_participantprogramyearid}`}>{row.vsi_name ?? ''}</Link>
            : row.vsi_name ?? ''}
        </td>
      );
    }
    case 'producer': {
      const v = (row.vsi_participantidname ?? raw['_vsi_participantid_value@OData.Community.Display.V1.FormattedValue'] ?? '') as string;
      const participantId = row._vsi_participantid_value;
      const appId = coreAppId?.trim() || CORE_APP_ID_FALLBACK;
      const href = `${resolvedCoreBaseUrl}?appid=${encodeURIComponent(appId)}&pagetype=entityrecord&etn=account&id=${encodeURIComponent(participantId ?? '')}`;
      return (
        <td key={key} className="cell-pin">
          {participantId
            ? <a className="cell-pin-link" href={href} target="_blank" rel="noopener noreferrer">{v}</a>
            : v}
        </td>
      );
    }
    case 'year': {
      const v = row.vsi_programyearidname ?? raw['_vsi_programyearid_value@OData.Community.Display.V1.FormattedValue'] ?? '';
      return <td key={key} className="cell-year">{v as string}</td>;
    }
    case 'taskStatus': {
      const l = getTaskStatusLabel(row.vsi_taskstatus);
      return <td key={key} className="cell-task-status"><span className={`task-badge task-${l.toLowerCase()}`}>{taskStatusIcon(l)} {l}</span></td>;
    }
    case 'enrolStatus': {
      const l = getEnrolmentStatusLabel(row.vsi_enrolmentstatus);
      const is45Day = l === '_45DayLetter';
      const startDate = is45Day ? row.vsi_fortyfivedayletterstartdate : undefined;
      const paused = is45Day ? !!row.vsi_fortyfivedaycounterpaused : false;
      const pauseDate = is45Day ? row.vsi_fortyfivedaypausedate : undefined;
      // While paused: freeze the count at the moment of pausing; after resume the start date is shifted forward
      const referenceDate = paused && pauseDate ? new Date(pauseDate).getTime() : Date.now() - 7 * 60 * 60 * 1000;
      const days = startDate ? Math.floor((referenceDate - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24)) : null;
      return (
        <td key={key} className="cell-enrol-status">
          <div className="enrol-status-cell">
            <span className="enrol-badge">{formatEnrolmentStatusDisplay(l)}</span>
            {days !== null && (
              <span className={`days-badge ${days >= 35 && !paused ? 'badge-red' : ''} ${paused ? 'badge-paused' : ''}`}>
                {paused ? '⏸ ' : ''}{days}d
              </span>
            )}
          </div>
        </td>
      );
    }
    case 'fee': {
      const adminFee = row.vsi_administrativecostsharingfee ?? 0;
      const calcFee = row.vsi_enrolmentfee != null ? row.vsi_enrolmentfee + adminFee : null;
      const variance = row.vsi_enrolmentfee != null && row.vsi_variancecalculation != null ? row.vsi_variancecalculation * 100 : null;
      const varianceClass = getVarianceClass(variance);
      const varianceText = formatVariancePercent(variance);

      return (
        <td key={key} className="cell-fee">
          <div className="calculated-fee-cell">
            <span className="calculated-fee-value">{formatCurrency(calcFee)}</span>
            {variance != null ? <span className={`variance-pill ${varianceClass}`}>{varianceText}</span> : null}
            {row.vsi_participantprogramyearid
              ? (
                <Link
                  to={`/calculation/${source}/${row.vsi_participantprogramyearid}`}
                  aria-label="Go to calculation"
                  data-tooltip="Go to calculation"
                  className="sa-calc-link cell-fee-calc"
                >
                  <Calculator size={20} />
                </Link>
              )
              : null}
          </div>
        </td>
      );
    }
    case 'totalFeesOwedCalculated': {
      const variance = row.vsi_enrolmentfee != null && row.vsi_variancecalculation != null ? row.vsi_variancecalculation * 100 : null;
      const varianceClass = getVarianceClass(variance);
      const varianceText = formatVariancePercent(variance);
      return (
        <td key={key} className="cell-fee">
          <div className="calculated-fee-cell">
            <span className="calculated-fee-value">{formatCurrency(row.vsi_totalfeesowedcalculated)}</span>
            {variance != null ? <span className={`variance-pill ${varianceClass}`}>{varianceText}</span> : null}
          </div>
        </td>
      );
    }
    case 'totalFeesPaid': return <td key={key} className="cell-fee">{formatCurrency(row.vsi_totalfeespaid)}</td>;
    case 'enrolmentFee': return <td key={key} className="cell-fee">{formatCurrency(row.vsi_enrolmentfee)}</td>;
    case 'latePay': return <td key={key} className="cell-fee">{formatCurrency(row.vsi_latepaymentfee)}</td>;
    case 'flagged': {
      const variance = row.vsi_variancecalculation != null ? row.vsi_variancecalculation * 100 : null;
      const isFlagged = (variance != null && Math.abs(variance) > getEnrolmentEnFeeVarianceThreshold())
        || row.vsi_prevyearpartnotverified === true
        || (row.vsi_enrolmentfee != null && row.vsi_previousyearcalculatedenfee == null);
      return <td key={key} className="cell-flag">{isFlagged ? <Flag size={14} color="#dc2626" fill="#dc2626" aria-label="Flagged" /> : null}</td>;
    }
    case 'sharepoint':
      return (
        <td key={key} className="cell-sp">
          {row.vsi_sharepointdocumentfolder
            ? (
              <a href={row.vsi_sharepointdocumentfolder} target="_blank" rel="noopener noreferrer" className="sp-icon-link" title="Open in SharePoint">
                <img src={sharepointIconUrl} className="sp-icon" alt="SharePoint" aria-hidden="true" />
              </a>
            )
            : null}
        </td>
      );
    case 'owner': {
      const name = (row.owneridname ?? raw['_ownerid_value@OData.Community.Display.V1.FormattedValue'] ?? '') as string;
      const uid = raw['_ownerid_value'] as string | undefined;
      if (!name.trim() && !uid) {
        return <td key={key} className="cell-modified-by"></td>;
      }
      const photo = uid ? avatarUrls[uid] : undefined;
      return <td key={key} className="cell-modified-by">{photo
        ? <img className="avatar-circle" src={`data:image/jpeg;base64,${photo}`} alt={name} title={name} />
        : <span className="avatar-circle" style={{ background: getAvatarColor(name) }} title={name}>{getInitials(name)}</span>}</td>;
    }
    case 'modifiedOn': return <td key={key}>{fmtDate(row.modifiedon)}</td>;
    case 'regionalOffice': return <td key={key}>{enumLabel(Vsi_participantprogramyearsvsi_enrollmentregionaloffice, row.vsi_enrollmentregionaloffice)}</td>;
    case 'farmingSector': return <td key={key}>{enumLabel(Vsi_participantprogramyearsvsi_farmingsector, row.vsi_farmingsector)}</td>;
    case 'bringForward': return <td key={key}>{yesNo(row.vsi_bringforward)}</td>;
    case 'broughtForward': return <td key={key}>{yesNo(row.vsi_broughtforward)}</td>;
    case 'hasPartners': return <td key={key}>{yesNo(row.vsi_haspartners)}</td>;
    case 'inCombinedFarm': return <td key={key}>{yesNo(row.vsi_incombinedfarm)}</td>;
    case 'manualReview': return <td key={key}>{yesNo(row.vsi_manualreview)}</td>;
    case 'isNewParticipant': return <td key={key}>{yesNo(row.vsi_isnewparticipant)}</td>;
    case 'lateParticipant': return <td key={key}>{yesNo(row.vsi_fullyprovinciallyfunded)}</td>;
    case 'enrolNoticeDate': return <td key={key}>{fmtDate(row.vsi_enrolmentnoticesentdate)}</td>;
    case 'enrolmentOptedOutDate': return <td key={key}>{fmtDate(row.vsi_programyearoptoutdate)}</td>;
    case 'fileReceivedDate': return <td key={key}>{fmtDate(row.vsi_filereceiveddate)}</td>;
    case 'feesPaidDate': return <td key={key}>{fmtDate(row.vsi_enrolmentfeespaiddate)}</td>;
    default: return <td key={key}></td>;
  }
}

