import { Link } from 'react-router-dom';
import { Flag } from 'lucide-react';
import type { Vsi_participantprogramyears } from '../generated/models/Vsi_participantprogramyearsModel';
import {
  Vsi_participantprogramyearsvsi_enrollmentregionaloffice,
  Vsi_participantprogramyearsvsi_farmingsector,
} from '../generated/models/Vsi_participantprogramyearsModel';
import type { SortKey } from '../types/enrollment';
import {
  getEnrolmentStatusLabel, getTaskStatusLabel, taskStatusIcon,
  enrolmentStatusClass, formatCurrency, getInitials,
  calculateVariance, getVarianceClass, formatVariancePercent,
} from '../utils/helpers';

const CORE_APP_ID_FALLBACK = '88c024d9-9fd5-ec11-a7b5-002248ada475';
const CORE_BASE_URL_FALLBACK = 'https://aff-brmb-crm-dev.crm3.dynamics.com/main.aspx';

export function renderCell(
  key: SortKey,
  row: Vsi_participantprogramyears,
  raw: Record<string, unknown>,
  avatarUrls: Record<string, string>,
  coreAppId: string | null,
  coreBaseUrl: string | null,
) {
  const resolvedCoreBaseUrl = coreBaseUrl?.trim() || CORE_BASE_URL_FALLBACK;
  const yesNo = (v: unknown) => v === 1 ? 'Yes' : v === 0 ? 'No' : '';
  const enumLabel = (map: Record<number, string>, v: unknown) =>
    v != null ? map[Number(v)] ?? String(v) : '';
  const fmtDate = (v: unknown) => { if (!v) return ''; try { return new Date(v as string).toLocaleDateString(); } catch { return String(v); } };
  switch (key) {
    case 'pin':
      return (
        <td key={key} className="cell-pin">
          {row.vsi_participantprogramyearid
            ? <Link className="cell-pin-link" to={`/enrolment/${row.vsi_participantprogramyearid}`}>{row.vsi_name ?? ''}</Link>
            : row.vsi_name ?? ''}
        </td>
      );
    case 'producer': {
      const v = row.vsi_participantidname ?? raw['_vsi_participantid_value@OData.Community.Display.V1.FormattedValue'] ?? '';
      return <td key={key}>{v as string}</td>;
    }
    case 'year': {
      const v = row.vsi_programyearidname ?? raw['_vsi_programyearid_value@OData.Community.Display.V1.FormattedValue'] ?? '';
      return <td key={key}>{v as string}</td>;
    }
    case 'taskStatus': {
      const l = getTaskStatusLabel(row.vsi_taskstatus);
      return <td key={key}><span className={`task-badge task-${l.toLowerCase()}`}>{taskStatusIcon(l)} {l}</span></td>;
    }
    case 'enrolStatus': {
      const l = getEnrolmentStatusLabel(row.vsi_enrolmentstatus);
      return <td key={key}><span className={`enrol-badge ${enrolmentStatusClass(l)}`}>{l}</span></td>;
    }
    case 'fee': {
      const variance = calculateVariance(row.vsi_calculatedenfee, row.vsi_previousyearcalculatedenfee);
      const varianceClass = getVarianceClass(variance);
      const varianceText = formatVariancePercent(variance);

      return (
        <td key={key} className="cell-fee">
          <div className="calculated-fee-cell">
            {row.vsi_participantprogramyearid
              ? <Link className="calculated-fee-value" to={`/calculation/${row.vsi_participantprogramyearid}`}>{formatCurrency(row.vsi_calculatedenfee)}</Link>
              : <span className="calculated-fee-value">{formatCurrency(row.vsi_calculatedenfee)}</span>}
            {variance != null ? <span className={`variance-pill ${varianceClass}`}>{varianceText}</span> : null}
          </div>
        </td>
      );
    }
    case 'totalFeesOwed': return <td key={key} className="cell-fee">{formatCurrency(row.vsi_totalfeesowed)}</td>;
    case 'totalFeesPaid': return <td key={key} className="cell-fee">{formatCurrency(row.vsi_totalfeespaid)}</td>;
    case 'enrolmentFee': return <td key={key} className="cell-fee">{formatCurrency(row.vsi_enrolmentfee)}</td>;
    case 'latePay': return <td key={key} className="cell-fee">{formatCurrency(row.vsi_latepaymentfee)}</td>;
    case 'flagged': {
      const variance = calculateVariance(row.vsi_calculatedenfee, row.vsi_previousyearcalculatedenfee);
      const isFlagged = variance != null && Math.abs(variance) > 20;
      return <td key={key} className="cell-flag">{isFlagged ? <Flag size={14} color="#dc2626" fill="#dc2626" aria-label="Flagged" /> : null}</td>;
    }
    case 'sharepoint':
      return (
        <td key={key} className="cell-sp">
          {row.vsi_sharepointdocumentfolder
            ? (
              <a href={row.vsi_sharepointdocumentfolder} target="_blank" rel="noopener noreferrer" className="sp-icon-link" title="Open in SharePoint">
                <svg className="sp-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" aria-hidden="true">
                  <defs>
                    <linearGradient id="spGradCell" x1="5.822" y1="11.568" x2="20.178" y2="36.432" gradientUnits="userSpaceOnUse">
                      <stop offset="0" stopColor="#058f92"/>
                      <stop offset=".5" stopColor="#038489"/>
                      <stop offset="1" stopColor="#026d71"/>
                    </linearGradient>
                  </defs>
                  <circle cx="24" cy="15" r="12" fill="#036c70"/>
                  <circle cx="34" cy="26" r="11" fill="#1a9ba1"/>
                  <circle cx="25.5" cy="36.5" r="8.5" fill="#37c6d0"/>
                  <path fill="none" d="M0 0h48v48H0z"/>
                  <path d="M26 13.83v21.34a1.841 1.841 0 0 1-1.14 1.69 1.772 1.772 0 0 1-.69.14h-7.16c-.01-.17-.01-.33-.01-.5a4.18 4.18 0 0 1 .02-.5 8.473 8.473 0 0 1 5.09-7.29v-1.86A11.986 11.986 0 0 1 12.17 13a8.455 8.455 0 0 1 .21-1h11.79A1.837 1.837 0 0 1 26 13.83z" opacity=".1"/>
                  <path d="M23.17 13h-11a11.987 11.987 0 0 0 10.4 13.915c-3.1 1.47-5.359 5.645-5.551 9.085a4.18 4.18 0 0 0-.02.5c0 .17 0 .33.01.5a6.673 6.673 0 0 0 .13 1h6.03a1.841 1.841 0 0 0 1.69-1.14 1.772 1.772 0 0 0 .14-.69V14.83A1.837 1.837 0 0 0 23.17 13z" opacity=".2"/>
                  <path d="M23.17 13h-11a11.988 11.988 0 0 0 10.208 13.891c-3 1.576-5.17 5.741-5.358 9.109h6.15A1.844 1.844 0 0 0 25 34.17V14.83A1.837 1.837 0 0 0 23.17 13z" opacity=".2"/>
                  <path d="M22.17 13h-10a11.988 11.988 0 0 0 8.87 13.632A16.522 16.522 0 0 0 17.02 36h5.15A1.837 1.837 0 0 0 24 34.17V14.83A1.831 1.831 0 0 0 22.17 13z" opacity=".2"/>
                  <rect x="2" y="13" width="22" height="22" rx="1.833" fill="url(#spGradCell)"/>
                  <path d="M10.187 23.776a3.384 3.384 0 0 1-1.049-1.109 3.018 3.018 0 0 1-.365-1.517 2.919 2.919 0 0 1 .679-1.965 4.011 4.011 0 0 1 1.806-1.178 7.629 7.629 0 0 1 2.467-.382 9.392 9.392 0 0 1 3.25.455v2.3a5.073 5.073 0 0 0-1.47-.6 7.159 7.159 0 0 0-1.719-.206 3.719 3.719 0 0 0-1.767.374 1.159 1.159 0 0 0-.7 1.062 1.076 1.076 0 0 0 .3.752 2.69 2.69 0 0 0 .8.572q.5.249 1.5.662a1.519 1.519 0 0 1 .214.086 12.341 12.341 0 0 1 1.892.933 3.387 3.387 0 0 1 1.118 1.126 3.264 3.264 0 0 1 .4 1.7 3.162 3.162 0 0 1-.636 2.046 3.557 3.557 0 0 1-1.7 1.144 7.71 7.71 0 0 1-2.424.352 12.824 12.824 0 0 1-2.2-.18 7.534 7.534 0 0 1-1.783-.524v-2.425a5.746 5.746 0 0 0 1.8.86 7.042 7.042 0 0 0 1.986.318 3.42 3.42 0 0 0 1.8-.382A1.208 1.208 0 0 0 15 26.971a1.15 1.15 0 0 0-.34-.826 3.425 3.425 0 0 0-.937-.653q-.6-.3-1.767-.791a10.044 10.044 0 0 1-1.769-.925z" fill="#fff"/>
                </svg>
              </a>
            )
            : null}
        </td>
      );
    case 'core': {
      if (!row.vsi_participantprogramyearid) return <td key={key}></td>;
      const appId = coreAppId?.trim() || CORE_APP_ID_FALLBACK;
      const href = `${resolvedCoreBaseUrl}?appid=${encodeURIComponent(appId)}&pagetype=entityrecord&ent=account&id=${encodeURIComponent(row.vsi_participantprogramyearid)}`;
      return <td key={key} className="cell-sp"><a href={href} target="_blank" rel="noopener noreferrer" className="sp-link">Core</a></td>;
    }
    case 'owner': {
      const name = (row.owneridname ?? raw['_ownerid_value@OData.Community.Display.V1.FormattedValue'] ?? '') as string;
      const uid = raw['_ownerid_value'] as string | undefined;
      if (!name.trim() && !uid) {
        return <td key={key} className="cell-modified-by"></td>;
      }
      const photo = uid ? avatarUrls[uid] : undefined;
      return <td key={key} className="cell-modified-by">{photo
        ? <img className="avatar-circle" src={`data:image/jpeg;base64,${photo}`} alt={name} title={name} />
        : <span className="avatar-circle" title={name}>{getInitials(name)}</span>}</td>;
    }
    case 'modifiedOn': return <td key={key}>{fmtDate(row.modifiedon)}</td>;
    case 'regionalOffice': return <td key={key}>{enumLabel(Vsi_participantprogramyearsvsi_enrollmentregionaloffice, row.vsi_enrollmentregionaloffice)}</td>;
    case 'farmingSector': return <td key={key}>{enumLabel(Vsi_participantprogramyearsvsi_farmingsector, row.vsi_farmingsector)}</td>;
    case 'bringForward': return <td key={key}>{yesNo(row.vsi_bringforward)}</td>;
    case 'broughtForward': return <td key={key}>{yesNo(row.vsi_broughtforward)}</td>;
    case 'hasPartners': return <td key={key}>{yesNo(row.vsi_haspartners)}</td>;
    case 'inCombinedFarm': return <td key={key}>{yesNo(row.vsi_incombinedfarm)}</td>;
    case 'manualReview': return <td key={key}>{yesNo(row.vsi_manualreview)}</td>;
    case 'enrolNoticeDate': return <td key={key}>{fmtDate(row.vsi_enrolmentnoticesentdate)}</td>;
    case 'fileReceivedDate': return <td key={key}>{fmtDate(row.vsi_filereceiveddate)}</td>;
    case 'feesPaidDate': return <td key={key}>{fmtDate(row.vsi_enrolmentfeespaiddate)}</td>;
    default: return <td key={key}></td>;
  }
}
