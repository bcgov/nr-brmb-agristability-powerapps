import { useCallback, useEffect, useMemo, useState } from 'react';
import type { PersonalView, ViewPayload, SortKey, SortDir, FilterOperator, AdvFilterNode, LogicOp } from '../types/enrollment';
import { DEFAULT_VIEW_SNAPSHOT, USERQUERY_ENTITY, USERQUERY_TYPE } from '../constants/columns';
import { UserqueriesService } from '../generated/services/UserqueriesService';
import { SavedqueriesService } from '../generated/services/SavedqueriesService';
import { generateLayoutXml, userqueryToView, savedqueryToView, loadActiveViewId, saveActiveViewId } from '../utils/viewSerializer';
import { serializeFilterNodes, deserializeFilterNodes } from '../utils/filterTree';

export interface ViewState {
  visibleColumnKeys: SortKey[];
  columnWidths: Partial<Record<SortKey, number>>;
  sortKey: SortKey | null;
  sortDir: SortDir;
  filters: { verifiedCalc: boolean; unverifiedCalc: boolean; flagged: boolean; partnerships: boolean };
  taskStatusFilter: Set<string>;
  enrolStatusFilter: Set<string>;
  taskFilterOp: FilterOperator;
  enrolFilterOp: FilterOperator;
  advFilterNodes: AdvFilterNode[];
  advLogicOp: LogicOp;
}

export function useViews(state: ViewState, setters: {
  setVisibleColumnKeys: (keys: SortKey[]) => void;
  setColumnWidths: (w: Partial<Record<SortKey, number>>) => void;
  setSortKey: (k: SortKey | null) => void;
  setSortDir: (d: SortDir) => void;
  setFilters: (f: { verifiedCalc: boolean; unverifiedCalc: boolean; flagged: boolean; partnerships: boolean }) => void;
  setTaskStatusFilter: (s: Set<string>) => void;
  setEnrolStatusFilter: (s: Set<string>) => void;
  setTaskFilterOp: (op: FilterOperator) => void;
  setEnrolFilterOp: (op: FilterOperator) => void;
  setAdvFilterNodes: (n: AdvFilterNode[]) => void;
  setAdvLogicOp: (op: LogicOp) => void;
}) {
  const [savedViews, setSavedViews] = useState<PersonalView[]>([]);
  const [viewsLoading, setViewsLoading] = useState(true);
  const [activeViewId, setActiveViewId] = useState<string | null>(() => loadActiveViewId());

  const applyView = useCallback((view: ViewPayload) => {
    setters.setVisibleColumnKeys([...view.visibleColumnKeys]);
    setters.setColumnWidths({ ...view.columnWidths });
    setters.setSortKey(view.sortKey);
    setters.setSortDir(view.sortDir);
    setters.setFilters({ ...view.filters });
    setters.setTaskStatusFilter(new Set(view.taskStatusFilter));
    setters.setEnrolStatusFilter(new Set(view.enrolStatusFilter));
    setters.setTaskFilterOp(view.taskFilterOp);
    setters.setEnrolFilterOp(view.enrolFilterOp);
    setters.setAdvFilterNodes(deserializeFilterNodes(view.advFilterNodes as unknown[]));
    setters.setAdvLogicOp(view.advLogicOp);
  }, [setters]);

  const captureCurrentSnapshot = useCallback((): ViewPayload => ({
    visibleColumnKeys: [...state.visibleColumnKeys],
    columnWidths: { ...state.columnWidths },
    sortKey: state.sortKey,
    sortDir: state.sortDir,
    filters: { ...state.filters },
    taskStatusFilter: [...state.taskStatusFilter],
    enrolStatusFilter: [...state.enrolStatusFilter],
    taskFilterOp: state.taskFilterOp,
    enrolFilterOp: state.enrolFilterOp,
    advFilterNodes: serializeFilterNodes(state.advFilterNodes),
    advLogicOp: state.advLogicOp,
  }), [state]);

  const hasUnsavedChanges = useMemo(() => {
    const current = JSON.stringify(captureCurrentSnapshot());
    if (activeViewId) {
      const view = savedViews.find(v => v.id === activeViewId);
      if (!view) return true;
      const { id: _id, name: _name, source: _source, ...rest } = view;
      return current !== JSON.stringify(rest);
    }
    return current !== JSON.stringify(DEFAULT_VIEW_SNAPSHOT);
  }, [captureCurrentSnapshot, activeViewId, savedViews]);

  // Load views on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        let personal: PersonalView[] = [];
        let system: PersonalView[] = [];

        const [uqResult, sqResult] = await Promise.allSettled([
          UserqueriesService.getAll({
            select: ['userqueryid', 'name', 'layoutjson', 'layoutxml', 'returnedtypecode', 'querytype'],
            filter: `returnedtypecode eq '${USERQUERY_ENTITY}'`,
          }),
          SavedqueriesService.getAll({
            select: ['savedqueryid', 'name', 'layoutjson', 'layoutxml', 'returnedtypecode', 'querytype'],
            filter: `returnedtypecode eq '${USERQUERY_ENTITY}'`,
          }),
        ]);
        if (cancelled) return;

        if (uqResult.status === 'fulfilled') {
          personal = (uqResult.value.data ?? []).map(uq => userqueryToView(uq));
        } else {
          console.error('[Views] Failed to load personal views:', uqResult.reason);
        }
        if (sqResult.status === 'fulfilled') {
          const mainViews = (sqResult.value.data ?? []).filter(sq => String(sq.querytype) === '0');
          system = mainViews.map(savedqueryToView);
        } else {
          console.error('[Views] Failed to load system views:', sqResult.reason);
        }

        const allViews = [...personal, ...system];
        setSavedViews(allViews);

        const lastId = loadActiveViewId();
        if (lastId) {
          const match = allViews.find(v => v.id === lastId);
          if (match) applyView(match);
          else { setActiveViewId(null); saveActiveViewId(null); }
        }
      } catch (err) {
        console.error('[Views] Unexpected error loading views:', err);
      } finally {
        if (!cancelled) setViewsLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSelectView = useCallback((id: string | null) => {
    setActiveViewId(id);
    saveActiveViewId(id);
    if (id) {
      const view = savedViews.find(v => v.id === id);
      if (view) applyView(view);
    } else {
      applyView(DEFAULT_VIEW_SNAPSHOT);
    }
  }, [savedViews, applyView]);

  const handleSaveAsNew = useCallback(async (name: string) => {
    const snap = captureCurrentSnapshot();
    const payload = {
      name,
      returnedtypecode: USERQUERY_ENTITY,
      querytype: USERQUERY_TYPE,
      fetchxml: '<fetch><entity name="vsi_participantprogramyear"/></fetch>',
      layoutjson: JSON.stringify(snap),
      layoutxml: generateLayoutXml(snap.visibleColumnKeys, snap.columnWidths),
    };
    try {
      const result = await UserqueriesService.create(payload as any);
      const created = result.data;
      if (created) {
        const newView: PersonalView = { id: created.userqueryid, name, source: 'personal', ...snap };
        setSavedViews(prev => [...prev, newView]);
        setActiveViewId(newView.id);
        saveActiveViewId(newView.id);
      }
    } catch (e) {
      console.error('Failed to create view:', e);
    }
  }, [captureCurrentSnapshot]);

  const handleSaveCurrentView = useCallback(async () => {
    if (!activeViewId) return;
    const view = savedViews.find(v => v.id === activeViewId);
    if (!view || view.source !== 'personal') return;
    const snap = captureCurrentSnapshot();
    try {
      await UserqueriesService.update(activeViewId, {
        layoutjson: JSON.stringify(snap),
        layoutxml: generateLayoutXml(snap.visibleColumnKeys, snap.columnWidths),
      });
      setSavedViews(prev => prev.map(v => v.id === activeViewId ? { ...v, ...snap } : v));
    } catch (e) {
      console.error('Failed to update view:', e);
    }
  }, [activeViewId, savedViews, captureCurrentSnapshot]);

  const handleDeleteView = useCallback(async (id: string) => {
    const view = savedViews.find(v => v.id === id);
    if (!view || view.source !== 'personal') return;
    try {
      await UserqueriesService.delete(id);
      setSavedViews(prev => prev.filter(v => v.id !== id));
      if (activeViewId === id) {
        setActiveViewId(null);
        saveActiveViewId(null);
        applyView(DEFAULT_VIEW_SNAPSHOT);
      }
    } catch (e) {
      console.error('Failed to delete view:', e);
    }
  }, [savedViews, activeViewId, applyView]);

  const handleRenameView = useCallback(async (id: string, name: string) => {
    if (!name) return;
    const view = savedViews.find(v => v.id === id);
    if (!view || view.source !== 'personal') return;
    try {
      await UserqueriesService.update(id, { name });
      setSavedViews(prev => prev.map(v => v.id === id ? { ...v, name } : v));
    } catch (e) {
      console.error('Failed to rename view:', e);
    }
  }, [savedViews]);

  const handleResetDefault = useCallback(() => {
    setActiveViewId(null);
    saveActiveViewId(null);
    applyView(DEFAULT_VIEW_SNAPSHOT);
  }, [applyView]);

  return {
    savedViews,
    viewsLoading,
    activeViewId,
    hasUnsavedChanges,
    handleSelectView,
    handleSaveAsNew,
    handleSaveCurrentView,
    handleDeleteView,
    handleRenameView,
    handleResetDefault,
  };
}
