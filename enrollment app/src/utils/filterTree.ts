import type { AdvFilterNode, AdvFilterRow, AdvFilterGroup, AdvFilterField, LogicOp } from '../types/enrollment';
import { ADV_FIELD_OPTIONS } from '../constants/columns';

let _nextFilterId = 1;
export function nextFilterId() { return _nextFilterId++; }

export function emptyFilterRow(): AdvFilterRow {
  return { kind: 'row', id: nextFilterId(), field: '' as AdvFilterField, operator: 'equals', values: new Set(), textValue: '' };
}

export function emptyFilterGroup(): AdvFilterGroup {
  return { kind: 'group', id: nextFilterId(), logic: 'AND', children: [emptyFilterRow()] };
}

export function cloneNode(node: AdvFilterNode): AdvFilterNode {
  if (node.kind === 'row') return { ...node, values: new Set(node.values) };
  return { ...node, children: node.children.map(cloneNode) };
}

export function updateNodeInTree(nodes: AdvFilterNode[], id: number, updater: (n: AdvFilterNode) => AdvFilterNode | null): AdvFilterNode[] {
  const result: AdvFilterNode[] = [];
  for (const node of nodes) {
    if (node.id === id) {
      const updated = updater(node);
      if (updated) result.push(updated);
    } else if (node.kind === 'group') {
      result.push({ ...node, children: updateNodeInTree(node.children, id, updater) });
    } else {
      result.push(node);
    }
  }
  return result;
}

export function wrapNodeInGroup(nodes: AdvFilterNode[], id: number): AdvFilterNode[] {
  return nodes.map(n => {
    if (n.id === id) {
      return { kind: 'group' as const, id: nextFilterId(), logic: 'AND' as LogicOp, children: [cloneNode(n)] };
    }
    if (n.kind === 'group') {
      return { ...n, children: wrapNodeInGroup(n.children, id) };
    }
    return n;
  });
}

export function ungroupNode(nodes: AdvFilterNode[], id: number): AdvFilterNode[] {
  const result: AdvFilterNode[] = [];
  for (const n of nodes) {
    if (n.id === id && n.kind === 'group') {
      result.push(...n.children);
    } else if (n.kind === 'group') {
      result.push({ ...n, children: ungroupNode(n.children, id) });
    } else {
      result.push(n);
    }
  }
  return result;
}

export function addNodeToParent(nodes: AdvFilterNode[], parentId: number | null, newNode: AdvFilterNode): AdvFilterNode[] {
  if (parentId === null) return [...nodes, newNode];
  return nodes.map(n => {
    if (n.kind === 'group' && n.id === parentId) {
      return { ...n, children: [...n.children, newNode] };
    }
    if (n.kind === 'group') {
      return { ...n, children: addNodeToParent(n.children, parentId, newNode) };
    }
    return n;
  });
}

export function isNodeActive(node: AdvFilterNode): boolean {
  if (node.kind === 'row') {
    if (!node.field) return false;
    return ADV_FIELD_OPTIONS[node.field] === 'choice' ? node.values.size > 0 : !!node.textValue;
  }
  return node.children.some(isNodeActive);
}

export function countActiveNodes(nodes: AdvFilterNode[]): number {
  let count = 0;
  for (const n of nodes) {
    if (n.kind === 'row' && isNodeActive(n)) count++;
    else if (n.kind === 'group') count += countActiveNodes(n.children);
  }
  return count;
}

export function summarizeGroup(group: AdvFilterGroup): string {
  const ops = group.children
    .filter(c => c.kind === 'row')
    .slice(0, 2)
    .map(c => {
      const labels: Record<string, string> = {
        equals: 'Equals', notEquals: 'Does not equal', contains: 'Contains',
        notContains: 'Does not contain', beginsWith: 'Begins with', endsWith: 'Ends with',
      };
      return labels[(c as AdvFilterRow).operator] ?? '';
    })
    .join(', ');
  return `${group.logic} (... ${ops})`;
}

export function serializeFilterNodes(nodes: AdvFilterNode[]): unknown[] {
  return nodes.map(n => {
    if (n.kind === 'row') return { ...n, values: [...n.values] };
    return { ...n, children: serializeFilterNodes(n.children) };
  });
}

export function deserializeFilterNodes(raw: unknown[]): AdvFilterNode[] {
  return (raw ?? []).map((n) => {
    if (typeof n !== 'object' || n === null) return emptyFilterRow();

    const node = n as {
      kind?: unknown;
      id?: unknown;
      field?: unknown;
      operator?: unknown;
      values?: unknown;
      textValue?: unknown;
      logic?: unknown;
      children?: unknown;
    };

    if (node.kind === 'row') {
      const values = Array.isArray(node.values) ? node.values.map(String) : [];
      return {
        kind: 'row',
        id: typeof node.id === 'number' ? node.id : nextFilterId(),
        field: typeof node.field === 'string' ? (node.field as AdvFilterField) : ('' as AdvFilterField),
        operator: typeof node.operator === 'string' ? (node.operator as AdvFilterRow['operator']) : 'equals',
        values: new Set(values),
        textValue: typeof node.textValue === 'string' ? node.textValue : '',
      };
    }

    const children = Array.isArray(node.children) ? node.children : [];
    return {
      kind: 'group',
      id: typeof node.id === 'number' ? node.id : nextFilterId(),
      logic: node.logic === 'OR' ? 'OR' : 'AND',
      children: deserializeFilterNodes(children),
    };
  });
}
