/**
 * Hook for fetching cross-rig graph data for visualization.
 * Queries issues and dependencies across all rig databases,
 * returning GraphNode[]/GraphEdge[] ready for GraphView.
 */
import type { GraphEdge, GraphNode } from "@beads-ide/shared";
import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/rpc";

/** Rig-aware graph node with rig database source */
export interface CrossRigGraphNode extends GraphNode {
  _rig_db: string;
}

export interface CrossRigGraphData {
  nodes: CrossRigGraphNode[];
  edges: GraphEdge[];
  nodeCount: number;
  edgeCount: number;
  density: number;
  rigs: Record<string, number>;
}

export interface UseCrossRigGraphReturn {
  graph: CrossRigGraphData | null;
  isLoading: boolean;
  error: Error | null;
  refresh: () => void;
}

/** Generate consistent color for a rig name */
const RIG_COLORS: Record<string, string> = {};
const PALETTE = [
  "#3b82f6", "#ef4444", "#22c55e", "#f59e0b", "#8b5cf6",
  "#ec4899", "#06b6d4", "#f97316", "#14b8a6", "#6366f1",
  "#84cc16", "#e11d48", "#0ea5e9", "#a855f7", "#10b981",
];
let colorIndex = 0;

export function getRigColor(rig: string): string {
  if (!RIG_COLORS[rig]) {
    RIG_COLORS[rig] = PALETTE[colorIndex % PALETTE.length];
    colorIndex++;
  }
  return RIG_COLORS[rig];
}

export interface CrossRigGraphFilters {
  rigs?: string[];
  exclude_noise?: boolean;
}

const EMPTY_FILTERS: CrossRigGraphFilters = { exclude_noise: true };

export function useCrossRigGraph(
  filters: CrossRigGraphFilters = EMPTY_FILTERS
): UseCrossRigGraphReturn {
  const [graph, setGraph] = useState<CrossRigGraphData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const filterKey = JSON.stringify(filters);

  const doFetch = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const query: Record<string, string> = {};
      if (filters.rigs?.length) query.rigs = filters.rigs.join(",");
      if (filters.exclude_noise) query.exclude_noise = "true";

      const res = await api.crossrig.graph.$get({ query });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Request failed: ${res.status}`);
      }

      const data = await res.json() as any;

      // Tag nodes with rig label for GraphView
      const nodes: CrossRigGraphNode[] = (data.nodes ?? []).map((n: any) => ({
        id: n.id,
        title: n.title,
        status: n.status,
        type: n.type,
        priority: n.priority,
        labels: [...(n.labels || []), n._rig_db],
        _rig_db: n._rig_db,
      }));

      const edges: GraphEdge[] = (data.edges ?? []).map((e: any) => ({
        from: e.from,
        to: e.to,
        type: e.type,
      }));

      // Filter edges to only include edges where both nodes exist
      const nodeIds = new Set(nodes.map((n) => n.id));
      const validEdges = edges.filter((e) => nodeIds.has(e.from) && nodeIds.has(e.to));

      const nodeCount = nodes.length;
      const edgeCount = validEdges.length;
      const density = nodeCount > 1 ? edgeCount / (nodeCount * (nodeCount - 1)) : 0;

      setGraph({
        nodes,
        edges: validEdges,
        nodeCount,
        edgeCount,
        density,
        rigs: data.rigs ?? {},
      });
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
      setGraph(null);
    } finally {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);

  useEffect(() => {
    doFetch();
  }, [doFetch]);

  return {
    graph,
    isLoading,
    error,
    refresh: doFetch,
  };
}
