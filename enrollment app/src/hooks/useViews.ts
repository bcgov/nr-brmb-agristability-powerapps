import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  PersonalView,
  ViewPayload,
  SortKey,
  SortDir,
  FilterOperator,
  AdvFilterNode,
  LogicOp,
  QuickFilterState,
} from '../types/enrollment';
import { DEFAULT_VIEW_SNAPSHOT, USERQUERY_ENTITY, USERQUERY_TYPE } from '../constants/columns';
import { UserqueriesService } from '../generated/services/UserqueriesService';
import { SavedqueriesService } from '../generated/services/SavedqueriesService';
import { SystemusersService } from '../generated/services/SystemusersService';
import { TeamsService } from '../generated/services/TeamsService';
import { generateLayoutXml, generateFetchXml, userqueryToView, savedqueryToView, loadActiveViewId, saveActiveViewId, resolveEntityObjectTypeCode, setEntityObjectTypeCode, getEntityObjectTypeCode } from '../utils/viewSerializer';
import { serializeFilterNodes, deserializeFilterNodes } from '../utils/filterTree';
import type { Userqueries } from '../generated/models/UserqueriesModel';

export interface ViewState {
  visibleColumnKeys: SortKey[];
  columnWidths: Partial<Record<SortKey, number>>;
  sortKey: SortKey | null;
  sortDir: SortDir;
  filters: QuickFilterState;
  taskStatusFilter: Set<string>;
  enrolStatusFilter: Set<string>;
  yearFilter: Set<string>;
  ownerFilter: Set<string>;
  taskFilterOp: FilterOperator;
  enrolFilterOp: FilterOperator;
  advFilterNodes: AdvFilterNode[];
  advLogicOp: LogicOp;
}

function shouldRestoreLastViewOnLoad(): boolean {
  if (typeof window === 'undefined') return false;

  const searchParams = new URLSearchParams(window.location.search);
  const searchValue = (searchParams.get('restoreLastView') ?? '').toLowerCase();
  if (searchValue === '1' || searchValue === 'true') return true;

  const hashQuery = window.location.hash.includes('?')
    ? window.location.hash.split('?')[1]
    : '';
  const hashParams = new URLSearchParams(hashQuery);
  const hashValue = (hashParams.get('restoreLastView') ?? '').toLowerCase();
  return hashValue === '1' || hashValue === 'true';
}

function getRawOwnerId(uq: Userqueries): string | undefined {
  const raw = uq as unknown as Record<string, unknown>;
  const ownerId = uq.ownerid || raw['_ownerid_value'];
  return typeof ownerId === 'string' && ownerId.trim() ? ownerId.trim() : undefined;
}

function getRawOwnerType(uq: Userqueries): string | undefined {
  const raw = uq as unknown as Record<string, unknown>;
  const ownerType = uq.owneridtype || raw['_ownerid_value@Microsoft.Dynamics.CRM.lookuplogicalname'];
  return typeof ownerType === 'string' ? ownerType.toLowerCase() : undefined;
}

type WinWithXrmWebApi = {
  Xrm?: {
    WebApi?: {
      retrieveMultipleRecords: (
        entityType: string,
        options?: string,
        maxPageSize?: number
      ) => Promise<{ entities: Array<Record<string, unknown>> }>;
    };
  };
};

async function getUserqueryOwnerNamesFromXrm(userqueryIds: string[]): Promise<Map<string, string>> {
  const ownerNames = new Map<string, string>();
  if (userqueryIds.length === 0 || typeof window === 'undefined') return ownerNames;

  const candidates = [window, window.parent, window.top];
  const filter = userqueryIds
    .map(id => `userqueryid eq ${id}`)
    .join(' or ');
  const options = `?$select=userqueryid,_ownerid_value&$filter=${filter}`;

  for (const candidate of candidates) {
    try {
      const webApi = (candidate as unknown as WinWithXrmWebApi | undefined)?.Xrm?.WebApi;
      if (!webApi?.retrieveMultipleRecords) continue;

      const result = await webApi.retrieveMultipleRecords('userquery', options);
      for (const entity of result.entities ?? []) {
        const id = entity.userqueryid;
        const ownerName = entity['_ownerid_value@OData.Community.Display.V1.FormattedValue'];
        if (typeof id === 'string' && typeof ownerName === 'string' && ownerName.trim()) {
          ownerNames.set(id, ownerName.trim());
        }
      }
      if (ownerNames.size > 0) return ownerNames;
    } catch (e) {
      console.warn('[Views] Xrm.WebApi owner lookup failed:', e);
    }
  }

  return ownerNames;
}

async function addOwnerNamesToPersonalViews(views: PersonalView[], userqueries: Userqueries[]): Promise<PersonalView[]> {
  const missingOwnerViews = views.filter(v => v.source === 'personal' && !v.ownerName);
  if (missingOwnerViews.length === 0) return views;

  const xrmOwnerNames = await getUserqueryOwnerNamesFromXrm(missingOwnerViews.map(v => v.id));
  if (xrmOwnerNames.size > 0) {
    views = views.map(view => {
      if (view.source !== 'personal' || view.ownerName) return view;
      const ownerName = xrmOwnerNames.get(view.id);
      return ownerName ? { ...view, ownerName } : view;
    });
  }

  const ownerByViewId = new Map(
    userqueries
      .map(uq => [uq.userqueryid, { id: getRawOwnerId(uq), type: getRawOwnerType(uq) }] as const)
      .filter(([, owner]) => Boolean(owner.id))
  );
  const userOwnerIds = [...new Set(
    [...ownerByViewId.values()]
      .filter(owner => !owner.type || owner.type === 'systemuser')
      .map(owner => owner.id as string)
  )];
  const teamOwnerIds = [...new Set(
    [...ownerByViewId.values()]
      .filter(owner => owner.type === 'team')
      .map(owner => owner.id as string)
  )];

  const ownerNames = new Map<string, string>();
  const [usersResult, teamsResult] = await Promise.allSettled([
    userOwnerIds.length
      ? SystemusersService.getAll({
          select: ['systemuserid', 'fullname', 'internalemailaddress', 'domainname'],
          filter: userOwnerIds.map(id => `systemuserid eq ${id}`).join(' or '),
        })
      : Promise.resolve(null),
    teamOwnerIds.length
      ? TeamsService.getAll({
          select: ['teamid', 'name'],
          filter: teamOwnerIds.map(id => `teamid eq ${id}`).join(' or '),
        })
      : Promise.resolve(null),
  ]);

  if (usersResult.status === 'fulfilled' && usersResult.value) {
    for (const user of usersResult.value.data ?? []) {
      const name = user.fullname || user.internalemailaddress || user.domainname;
      if (user.systemuserid && name) ownerNames.set(user.systemuserid, name);
    }
  }
  if (teamsResult.status === 'fulfilled' && teamsResult.value) {
    for (const team of teamsResult.value.data ?? []) {
      if (team.teamid && team.name) ownerNames.set(team.teamid, team.name);
    }
  }

  return views.map(view => {
    if (view.source !== 'personal' || view.ownerName) return view;
    const ownerId = ownerByViewId.get(view.id)?.id;
    const ownerName = ownerId ? ownerNames.get(ownerId) : undefined;
    return ownerName ? { ...view, ownerName } : view;
  });
}

export function useViews(state: ViewState, setters: {
  setVisibleColumnKeys: (keys: SortKey[]) => void;
  setColumnWidths: (w: Partial<Record<SortKey, number>>) => void;
  setSortKey: (k: SortKey | null) => void;
  setSortDir: (d: SortDir) => void;
  setFilters: (f: QuickFilterState) => void;
  setTaskStatusFilter: (s: Set<string>) => void;
  setEnrolStatusFilter: (s: Set<string>) => void;
  setTaskFilterOp: (op: FilterOperator) => void;
  setEnrolFilterOp: (op: FilterOperator) => void;
  setAdvFilterNodes: (n: AdvFilterNode[]) => void;
  setAdvLogicOp: (op: LogicOp) => void;
  setYearFilter: (s: Set<string>) => void;
  setOwnerFilter: (s: Set<string>) => void;
}) {
  const [savedViews, setSavedViews] = useState<PersonalView[]>([]);
  const [viewsLoading, setViewsLoading] = useState(true);
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const ensureRequiredColumns = useCallback((keys: SortKey[]): SortKey[] => {
    // Ensure 'flagged' is always the first column
    const without = keys.filter((k): k is Exclude<SortKey, 'flagged'> => k !== 'flagged');
    return ['flagged', ...without];
  }, []);

  const applyView = useCallback((view: ViewPayload & { id?: string; name?: string; source?: string }) => {
    setters.setVisibleColumnKeys(ensureRequiredColumns(view.visibleColumnKeys));
    setters.setColumnWidths({ ...view.columnWidths });
    setters.setSortKey(view.sortKey);
    setters.setSortDir(view.sortDir);
    setters.setFilters({ ...DEFAULT_VIEW_SNAPSHOT.filters, ...view.filters });
    setters.setTaskStatusFilter(new Set(view.taskStatusFilter));
    setters.setEnrolStatusFilter(new Set(view.enrolStatusFilter));
    setters.setYearFilter(new Set(view.yearFilter ?? []));
    setters.setOwnerFilter(new Set(view.ownerFilter ?? []));
    setters.setTaskFilterOp(view.taskFilterOp ?? 'equals');
    setters.setEnrolFilterOp(view.enrolFilterOp ?? 'equals');
    setters.setAdvFilterNodes(deserializeFilterNodes(view.advFilterNodes as unknown[]));
    setters.setAdvLogicOp(view.advLogicOp ?? 'AND');
  }, [setters, ensureRequiredColumns]);

  const captureCurrentSnapshot = useCallback((): ViewPayload => ({
    visibleColumnKeys: ensureRequiredColumns(state.visibleColumnKeys),
    columnWidths: { ...state.columnWidths },
    sortKey: state.sortKey,
    sortDir: state.sortDir,
    filters: { ...state.filters },
    taskStatusFilter: [...state.taskStatusFilter],
    enrolStatusFilter: [...state.enrolStatusFilter],
    yearFilter: [...state.yearFilter],
    ownerFilter: [...state.ownerFilter],
    taskFilterOp: state.taskFilterOp,
    enrolFilterOp: state.enrolFilterOp,
    advFilterNodes: serializeFilterNodes(state.advFilterNodes),
    advLogicOp: state.advLogicOp,
  }), [state, ensureRequiredColumns]);

  const hasUnsavedChanges = useMemo(() => {
    const current = JSON.stringify(captureCurrentSnapshot());
    if (activeViewId) {
      const view = savedViews.find(v => v.id === activeViewId);
      if (!view) return true;
      const savedSnapshot: ViewPayload = {
        visibleColumnKeys: ensureRequiredColumns(view.visibleColumnKeys),
        columnWidths: { ...view.columnWidths },
        sortKey: view.sortKey,
        sortDir: view.sortDir,
        filters: { ...DEFAULT_VIEW_SNAPSHOT.filters, ...view.filters },
        taskStatusFilter: [...view.taskStatusFilter],
        enrolStatusFilter: [...view.enrolStatusFilter],
        yearFilter: [...(view.yearFilter ?? [])],
        ownerFilter: [...(view.ownerFilter ?? [])],
        taskFilterOp: view.taskFilterOp,
        enrolFilterOp: view.enrolFilterOp,
        advFilterNodes: serializeFilterNodes(deserializeFilterNodes(view.advFilterNodes as unknown[])),
        advLogicOp: view.advLogicOp,
      };
      return current !== JSON.stringify(savedSnapshot);
    }
    return current !== JSON.stringify(DEFAULT_VIEW_SNAPSHOT);
  }, [captureCurrentSnapshot, activeViewId, savedViews, ensureRequiredColumns]);

  const loadViews = useCallback(async (applyActiveView = false) => {
    setViewsLoading(true);
    try {
      let personal: PersonalView[] = [];
      let system: PersonalView[] = [];

      const [uqResult, sqResult] = await Promise.allSettled([
        UserqueriesService.getAll({
          select: ['userqueryid', 'name', 'fetchxml', 'layoutjson', 'layoutxml', 'returnedtypecode', 'querytype', 'ownerid'],
          filter: `returnedtypecode eq '${USERQUERY_ENTITY}'`,
        }),
        SavedqueriesService.getAll({
          select: ['savedqueryid', 'name', 'layoutjson', 'layoutxml', 'fetchxml', 'returnedtypecode', 'querytype'],
          filter: `returnedtypecode eq '${USERQUERY_ENTITY}'`,
        }),
      ]);

      // Ensure the entity ObjectTypeCode is resolved before we might need it for
      // layoutxml generation. Does nothing if already resolved from a previous call.
      await resolveEntityObjectTypeCode();

      if (uqResult.status === 'fulfilled') {
        const userqueries = uqResult.value.data ?? [];
        personal = await addOwnerNamesToPersonalViews(userqueries.map(uq => userqueryToView(uq)), userqueries);
      } else {
        console.error('[Views] Failed to load personal views:', uqResult.reason);
      }
      if (sqResult.status === 'fulfilled') {
        const allSq = sqResult.value.data ?? [];
        // Extract entity ObjectTypeCode — try returnedtypecode as integer first,
        // then scan all layoutxml for object="\d+" (more reliable in test environments
        // where returnedtypecode is returned as the logical name string, not an integer).
        if (allSq.length > 0) {
          const rawCode = (allSq[0] as unknown as Record<string, unknown>)['returnedtypecode'];
          const num = Number(rawCode);
          if (!isNaN(num) && num > 0) {
            setEntityObjectTypeCode(num);
          }
        }
        if (!getEntityObjectTypeCode()) {
          for (const sq of allSq) {
            const match = (sq.layoutxml ?? '').match(/\bobject="(\d+)"/);
            if (match) {
              setEntityObjectTypeCode(Number(match[1]));
              break;
            }
          }
        }
        const mainViews = allSq.filter(sq => String(sq.querytype) === '0');
        system = mainViews.map(savedqueryToView);
      } else {
        console.error('[Views] Failed to load system views:', sqResult.reason);
      }

      const allViews = [...personal, ...system];
      setSavedViews(allViews);

      if (applyActiveView) {
        const lastId = loadActiveViewId();
        if (lastId) {
          const match = allViews.find(v => v.id === lastId);
          if (match) {
            setActiveViewId(lastId);
            applyView(match);
          } else {
            setActiveViewId(null);
            saveActiveViewId(null);
          }
        }
      }

      return allViews;
    } catch (err) {
      console.error('[Views] Unexpected error loading views:', err);
      return [];
    } finally {
      setViewsLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load views on mount
  useEffect(() => {
    loadViews(shouldRestoreLastViewOnLoad());
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
    setSaveError(null);
    // Ensure the entity object type code is resolved before generating layoutxml —
    // without it the <grid object="..."> attribute is missing and Dataverse rejects the save.
    await resolveEntityObjectTypeCode();
    const snap = captureCurrentSnapshot();
    // Only send fields that Dataverse accepts on create.
    // statecode/statuscode are managed by Dataverse and must NOT be included.
    const fetchxmlValue = generateFetchXml(snap.visibleColumnKeys, snap.advFilterNodes as unknown[], snap);
    const payload = {
      name,
      returnedtypecode: USERQUERY_ENTITY,
      querytype: USERQUERY_TYPE,
      fetchxml: fetchxmlValue,
      layoutjson: JSON.stringify(snap),
      layoutxml: generateLayoutXml(snap.visibleColumnKeys, snap.columnWidths),
    };
    try {
      const result = await UserqueriesService.create(payload as unknown as Parameters<typeof UserqueriesService.create>[0]);

      // The SDK returns { success: false, error } without throwing on API errors.
      // Must check result.success explicitly since a failed create does not throw.
      if (!result.success) {
        const errMsg = result.error instanceof Error
          ? result.error.message
          : (result.error as { message?: string })?.message ?? JSON.stringify(result.error);
        console.error('[Views] Create failed (non-throwing):', result.error);
        setSaveError(`Failed to save view: ${errMsg}`);
        return;
      }

      const created = result.data;
      // Reload views from Dataverse to ensure the new view appears regardless
      // of whether result.data is populated (SDK typically returns null on create)
      const allViews = await loadViews(false);
      const newId = created?.userqueryid;
      if (newId) {
        // Always use local snap state for filter/column data — Dataverse may not
        // return layoutjson immediately after create, causing filters to appear missing.
        const reloaded = allViews.find(v => v.id === newId);
        const newView: PersonalView = { ...(reloaded ?? {}), ...snap, id: newId, name, source: 'personal' };
        setSavedViews(prev => prev.some(v => v.id === newId) ? prev.map(v => v.id === newId ? newView : v) : [...prev, newView]);
        setActiveViewId(newId);
        saveActiveViewId(newId);
        applyView(newView);
      } else {
        // newId not in result — look for the newly named view in the reloaded list
        const match = allViews.find(v => v.name === name && v.source === 'personal');
        if (match) {
          const matchView: PersonalView = { ...match, ...snap, id: match.id, name: match.name, source: 'personal' };
          setSavedViews(prev => prev.map(v => v.id === match.id ? matchView : v));
          setActiveViewId(matchView.id);
          saveActiveViewId(matchView.id);
          applyView(matchView);
        } else {
          console.warn('[Views] New view not found after reload — name:', name, 'all personal:', allViews.filter(v => v.source === 'personal').map(v => v.name));
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[Views] Failed to create view:', e);
      setSaveError(`Failed to save view: ${msg}`);
    }
  }, [captureCurrentSnapshot, loadViews, applyView]);

  const handleSaveCurrentView = useCallback(async () => {
    if (!activeViewId) return;
    const view = savedViews.find(v => v.id === activeViewId);
    if (!view || view.source !== 'personal') return;
    const snap = captureCurrentSnapshot();
    // Ensure the entity object type code is resolved before generating layoutxml.
    await resolveEntityObjectTypeCode();
    const fetchxmlValue = generateFetchXml(snap.visibleColumnKeys, snap.advFilterNodes as unknown[], snap);
    try {
      await UserqueriesService.update(activeViewId, {
        layoutjson: JSON.stringify(snap),
        layoutxml: generateLayoutXml(snap.visibleColumnKeys, snap.columnWidths),
        fetchxml: fetchxmlValue,
      });
      setSavedViews(prev => prev.map(v => v.id === activeViewId ? { ...v, ...snap } : v));
      applyView({ ...view, ...snap });
    } catch (e) {
      console.error('Failed to update view:', e);
    }
  }, [activeViewId, savedViews, captureCurrentSnapshot, applyView]);

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
    saveError,
    handleSelectView,
    handleSaveAsNew,
    handleSaveCurrentView,
    handleDeleteView,
    handleRenameView,
    handleResetDefault,
    reloadViews: loadViews,
  };
}
