/**
 * Hook for fetching an epic's child bead graph.
 * Returns the epic + children with dependencies and wave ordering.
 */
import type { GraphEdge, GraphNode } from "@beads-ide/shared";
import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/rpc";

export interface EpicInfo {
  id: string;
  title: string;
  status: string;
  type: string;
}

export interface EpicGraphNode extends GraphNode {
  _rig_db: string;
  wave: number;
}

export interface EpicGraphData {
  epic: EpicInfo;
  nodes: EpicGraphNode[];
  edges: GraphEdge[];
  waves: string[][];
  nodeCount: number;
  edgeCount: number;
  density: number;
  rigs: Record<string, number>;
}

export interface UseEpicGraphReturn {
  graph: EpicGraphData | null;
  isLoading: boolean;
  error: Error | null;
  refresh: () => void;
}

export function useEpicGraph(epicId: string | null): UseEpicGraphReturn {
  const [graph, setGraph] = useState<EpicGraphData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const doFetch = useCallback(async () => {
    if (!epicId) {
      setGraph(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const res = await api.crossrig.epic[":id"].graph.$get({
        param: { id: epicId },
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Request failed: ${res.status}`);
      }

      const data = await res.json() as any;

      const nodes: EpicGraphNode[] = (data.nodes ?? []).map((n: any) => ({
        id: n.id,
        title: n.title,
        status: n.status,
        type: n.type,
        priority: n.priority,
        labels: n.labels || [],
        _rig_db: n._rig_db,
        wave: n.wave ?? 0,
      }));

      const edges: GraphEdge[] = (data.edges ?? []).map((e: any) => ({
        from: e.from,
        to: e.to,
        type: e.type,
      }));

      const nodeCount = nodes.length;
      const edgeCount = edges.length;
      const density = nodeCount > 1 ? edgeCount / (nodeCount * (nodeCount - 1)) : 0;

      setGraph({
        epic: data.epic,
        nodes,
        edges,
        waves: data.waves ?? [],
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
  }, [epicId]);

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
