/**
 * Hook for fetching beads list from GET /api/beads.
 * Uses centralized API client for connection state tracking and error classification.
 */
import type { BeadFull, BeadsListResponse } from "@beads-ide/shared";
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../lib/api";

/** Filter parameters for bead queries */
export interface BeadFilters {
  status?: string;
  type?: string;
  priority?: string;
  labels?: string[];
}

/** Return value of the useBeads hook */
export interface UseBeadsReturn {
  beads: BeadFull[];
  count: number;
  isLoading: boolean;
  error: Error | null;
  refresh: () => void;
}

/**
 * Build query string from filter params.
 */
function buildQueryString(filters: BeadFilters): string {
  const params = new URLSearchParams();

  if (filters.status) params.set("status", filters.status);
  if (filters.type) params.set("type", filters.type);
  if (filters.priority) params.set("priority", filters.priority);
  if (filters.labels) {
    for (const label of filters.labels) {
      params.append("labels", label);
    }
  }

  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

/**
 * Hook for fetching a filtered list of beads.
 * Automatically refetches when filters change.
 */
const EMPTY_FILTERS: BeadFilters = {};

export function useBeads(filters: BeadFilters = EMPTY_FILTERS): UseBeadsReturn {
  const [beads, setBeads] = useState<BeadFull[]>([]);
  const [count, setCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Stabilize filter values to prevent infinite re-fetch loops
  const filterKey = JSON.stringify(filters);

  const doFetch = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const qs = buildQueryString(filters);
      const { data, error: apiError } = await apiFetch<BeadsListResponse>(`/api/beads${qs}`);

      if (apiError) {
        throw new Error(apiError.details || apiError.message);
      }

      setBeads(data?.beads ?? []);
      setCount(data?.count ?? 0);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
      setBeads([]);
      setCount(0);
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
    isLoading,
    error,
    refresh: doFetch,
  };
}
