/**
 * Hook for fetching beads across all rig databases via Hono RPC client.
 * Uses type-safe API calls with response types inferred from backend routes.
 */
import type { BeadFull } from "@beads-ide/shared";
import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/rpc";

export interface CrossRigFilters {
  status?: string;
  type?: string;
  priority?: string;
  rigs?: string[];
  exclude_noise?: boolean;
  search?: string;
  limit?: number;
}

export interface UseCrossRigBeadsReturn {
  beads: BeadFull[];
  count: number;
  rigStats: Record<string, number>;
  isLoading: boolean;
  error: Error | null;
  refresh: () => void;
}

function buildQuery(filters: CrossRigFilters): Record<string, string> {
  const query: Record<string, string> = {};

  if (filters.status) query.status = filters.status;
  if (filters.type) query.type = filters.type;
  if (filters.priority) query.priority = filters.priority;
  if (filters.rigs?.length) query.rigs = filters.rigs.join(",");
  if (filters.exclude_noise) query.exclude_noise = "true";
  if (filters.search) query.search = filters.search;
  if (filters.limit) query.limit = String(filters.limit);

  return query;
}

const EMPTY_FILTERS: CrossRigFilters = {};

export function useCrossRigBeads(filters: CrossRigFilters = EMPTY_FILTERS): UseCrossRigBeadsReturn {
  const [beads, setBeads] = useState<BeadFull[]>([]);
  const [count, setCount] = useState(0);
  const [rigStats, setRigStats] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const filterKey = JSON.stringify(filters);

  const doFetch = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const res = await api.crossrig.beads.$get({
        query: buildQuery(filters),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Request failed: ${res.status}`);
      }

      const data = await res.json();
      setBeads((data as any).beads ?? []);
      setCount((data as any).count ?? 0);
      setRigStats((data as any).rigs ?? {});
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
      setBeads([]);
      setCount(0);
      setRigStats({});
    } finally {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);

  useEffect(() => {
    doFetch();
  }, [doFetch]);

  return {
    beads,
    count,
    rigStats,
    isLoading,
    error,
    refresh: doFetch,
  };
}
