import { useEffect, useState } from 'react';
import { Filter } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Vsi_participantprogramyears } from '../generated/models/Vsi_participantprogramyearsModel';
import { Vsi_participantprogramyearsService } from '../generated/services/Vsi_participantprogramyearsService';
import { calculateVariance, formatCurrencyOr, formatVariancePercent, getTaskStatusLabel, getVarianceClass } from '../utils/helpers';
import '../styles/supervisor-approval.css';

const PAGE_SIZE = 10;

function VariancePill({ variance }: { variance: number }) {
  const cls = getVarianceClass(variance);
  const text = formatVariancePercent(variance);
  return <span className={`variance-pill ${cls}`}>{text}</span>;
}

function StatusBadge({ status }: { status?: number }) {
  const label = getTaskStatusLabel(status) || 'Unknown';
  const clsByLabel: Record<string, string> = {
    Manual: 'pending',
    Supervisor: 'review',
    Ready: 'inprogress',
    Approved: 'approved',
  };
  const cls = clsByLabel[label] ?? 'pending';

  return (
    <span className={`sa-status-badge ${cls}`}>
      {label}
    </span>
  );
}

function getRowId(item: Vsi_participantprogramyears): string | null {
  return item.vsi_participantprogramyearid ?? null;
}

export function SupervisorApprovalPage() {
  const [items, setItems] = useState<Vsi_participantprogramyears[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setError(null);
        const result = await Vsi_participantprogramyearsService.getAll({
          select: [
            'vsi_name',
            'vsi_calculatedenfee',
            'vsi_previousyearcalculatedenfee',
            'vsi_taskstatus',
            'modifiedon',
          ],
          filter: "vsi_taskstatus eq 865520001",
          orderBy: ['modifiedon desc'],
          maxPageSize: 5000,
        });

        if (!cancelled) setItems(result.data ?? []);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const pageItems = items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const allSelected =
    pageItems.length > 0 && pageItems.every(item => {
      const itemId = getRowId(item);
      return itemId != null && selectedIds.has(itemId);
    });

  const toggleSelectAll = () => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (allSelected) {
        pageItems.forEach(item => {
          const itemId = getRowId(item);
          if (itemId != null) next.delete(itemId);
        });
      } else {
        pageItems.forEach(item => {
          const itemId = getRowId(item);
          if (itemId != null) next.add(itemId);
        });
      }
      return next;
    });
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectedCount = selectedIds.size;

  return (
    <div className="sa-wrapper">
      <div>
        <h1 className="sa-page-title">Supervisor&rsquo;s Approval Queue</h1>
        <p className="sa-page-subtitle">
          Review and manage pending approval items, update task statuses, and ensure timely processing.
        </p>
      </div>

      <div className="sa-filters-bar">
        <button type="button" className="sa-filter-btn">
          <Filter size={14} />
          Filters
        </button>
      </div>

      <div className="sa-card">
        <div className="sa-card-header">
          <div className="sa-card-title-block">
            <h2 className="sa-card-title">Pending Reviews</h2>
            <p className="sa-card-subtitle">Items requiring your attention, referred by admin(s)</p>
          </div>
          <div className="sa-bulk-actions">
            <button type="button" className="sa-btn-secondary">Bulk Actions</button>
            <button
              type="button"
              className="sa-btn-primary"
              disabled={selectedCount === 0}
            >
              Approve Selected{selectedCount > 0 ? ` (${selectedCount})` : ''}
            </button>
          </div>
        </div>

        <div className="sa-table-container">
          {loading && <p className="sa-state-msg loading">Loading queue items…</p>}
          {error && <p className="sa-state-msg error">Error: {error}</p>}
          {!loading && !error && items.length === 0 && (
            <p className="sa-state-msg empty">No pending items in the supervisor approval queue.</p>
          )}
          {!loading && !error && items.length > 0 && (
            <table className="sa-table">
              <thead>
                <tr>
                  <th className="sa-th-check">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleSelectAll}
                      aria-label="Select all"
                    />
                  </th>
                  <th>Enrolment Name</th>
                  <th>Task Status</th>
                  <th>Calculated Fee</th>
                  <th className="sa-th-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((item, index) => {
                  const itemId = getRowId(item);
                  const variance = calculateVariance(item.vsi_calculatedenfee, item.vsi_previousyearcalculatedenfee);

                  return (
                    <tr key={itemId ?? `${item.vsi_name ?? 'row'}-${index}`}>
                      <td className="sa-td-check">
                        <input
                          type="checkbox"
                          checked={itemId != null && selectedIds.has(itemId)}
                          onChange={() => {
                            if (itemId != null) toggleSelect(itemId);
                          }}
                          aria-label={`Select ${item.vsi_name ?? itemId ?? 'row'}`}
                          disabled={itemId == null}
                        />
                      </td>
                      <td className="sa-pin">{item.vsi_name ?? '—'}</td>
                      <td>
                        <StatusBadge status={item.vsi_taskstatus} />
                      </td>
                      <td>
                        <span className="sa-fee-cell">
                          {itemId
                            ? <Link className="sa-fee-amount sa-fee-link" to={`/calculation/${itemId}`}>{formatCurrencyOr(item.vsi_calculatedenfee, '—')}</Link>
                            : <span className="sa-fee-amount">{formatCurrencyOr(item.vsi_calculatedenfee, '—')}</span>}
                          {variance != null ? <VariancePill variance={variance} /> : null}
                        </span>
                      </td>
                      <td className="sa-td-actions">
                        <div className="sa-row-actions">
                          <button type="button" className="sa-action-btn">Assign</button>
                          {itemId
                            ? <Link className="sa-action-btn sa-action-link" to={`/calculation/${itemId}`}>Go to calculation</Link>
                            : <button type="button" className="sa-action-btn" disabled>Go to calculation</button>}
                          <button type="button" className="sa-action-btn sa-action-ready">Mark as Ready</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {!loading && !error && items.length > 0 && (
          <div className="sa-pagination">
            <span>
              Showing {Math.min((page - 1) * PAGE_SIZE + 1, items.length)}–
              {Math.min(page * PAGE_SIZE, items.length)} of {items.length} result
              {items.length !== 1 ? 's' : ''}
            </span>
            <div className="sa-pagination-controls">
              <button
                type="button"
                className="sa-page-btn"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                &lsaquo; Previous
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                <button
                  key={p}
                  type="button"
                  className={`sa-page-btn${p === page ? ' active' : ''}`}
                  onClick={() => setPage(p)}
                >
                  {p}
                </button>
              ))}
              <button
                type="button"
                className="sa-page-btn"
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
              >
                Next &rsaquo;
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

