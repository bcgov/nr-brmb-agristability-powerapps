import { Link } from 'react-router-dom';
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

export function renderCell(
  key: SortKey,
  row: Vsi_participantprogramyears,
  raw: Record<string, unknown>,
  avatarUrls: Record<string, string>,
) {
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
    case 'sharepoint':
      return <td key={key} className="cell-sp">{row.vsi_sharepointdocumentfolder ? <a href={row.vsi_sharepointdocumentfolder} target="_blank" rel="noopener noreferrer" className="sp-link">SharePoint</a> : ''}</td>;
    case 'modifiedBy': {
      const name = (row.modifiedbyname ?? raw['_modifiedby_value@OData.Community.Display.V1.FormattedValue'] ?? '') as string;
      const uid = raw['_modifiedby_value'] as string | undefined;
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
