import { createFileRoute } from "@tanstack/react-router";
import type { BeadFull } from "@beads-ide/shared";
import { type CSSProperties, useCallback, useMemo, useState } from "react";
import { useCrossRigBeads } from "../hooks/use-crossrig-beads";
import { BeadStatusBadge } from "../components/beads/bead-status-badge";
import { useBeadSelection } from "../contexts";

export const Route = createFileRoute("/crossrig")({
  component: CrossRigPage,
});

// --- Filter State ---

interface CrossRigFilterState {
  statuses: Set<string>;
  types: Set<string>;
  priorities: Set<number>;
  rigs: Set<string>;
}

function emptyFilters(): CrossRigFilterState {
  return {
    statuses: new Set(),
    types: new Set(),
    priorities: new Set(),
    rigs: new Set(),
  };
}

type GroupMode = "none" | "rig" | "type" | "status";

// --- Styles ---

const containerStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  height: "100%",
  backgroundColor: "#1e1e1e",
  color: "#e5e5e5",
};

const headerStyle: CSSProperties = {
  padding: "12px 16px",
  borderBottom: "1px solid #3c3c3c",
  display: "flex",
  alignItems: "center",
  gap: "12px",
};

const filterPanelStyle: CSSProperties = {
  padding: "8px 16px",
  borderBottom: "1px solid #3c3c3c",
  backgroundColor: "#252526",
  display: "flex",
  flexWrap: "wrap",
  gap: "12px",
  alignItems: "center",
};

const sectionStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "4px",
};

const sectionLabelStyle: CSSProperties = {
  fontSize: "10px",
  color: "#888",
  textTransform: "uppercase",
  letterSpacing: "0.5px",
  marginRight: "4px",
};

const chipStyle = (active: boolean): CSSProperties => ({
  padding: "2px 8px",
  fontSize: "11px",
  border: `1px solid ${active ? "#007acc" : "#3c3c3c"}`,
  borderRadius: "10px",
  background: active ? "#007acc33" : "transparent",
  color: active ? "#4fc1ff" : "#aaa",
  cursor: "pointer",
  whiteSpace: "nowrap",
});

const chipContainerStyle: CSSProperties = {
  display: "flex",
  gap: "4px",
  flexWrap: "wrap",
};

const listStyle: CSSProperties = {
  flex: 1,
  overflow: "auto",
  padding: "0",
};

const rowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
  padding: "6px 16px",
  borderBottom: "1px solid #2a2a2a",
  cursor: "pointer",
  fontSize: "13px",
};

const rigBadgeStyle: CSSProperties = {
  fontSize: "10px",
  padding: "1px 6px",
  borderRadius: "3px",
  backgroundColor: "#333",
  color: "#aaa",
  fontFamily: "monospace",
  minWidth: "24px",
  textAlign: "center",
};

const groupHeaderStyle: CSSProperties = {
  padding: "8px 16px",
  fontSize: "11px",
  fontWeight: 600,
  color: "#888",
  backgroundColor: "#1a1a1a",
  borderBottom: "1px solid #2a2a2a",
  textTransform: "uppercase",
  letterSpacing: "0.5px",
};

const countBarStyle: CSSProperties = {
  padding: "4px 16px",
  fontSize: "11px",
  color: "#666",
  borderBottom: "1px solid #2a2a2a",
};

const selectStyle: CSSProperties = {
  padding: "4px 8px",
  fontSize: "11px",
  backgroundColor: "#1e1e1e",
  color: "#e5e5e5",
  border: "1px solid #3c3c3c",
  borderRadius: "4px",
  cursor: "pointer",
};

const searchStyle: CSSProperties = {
  padding: "4px 8px",
  fontSize: "12px",
  backgroundColor: "#1e1e1e",
  color: "#e5e5e5",
  border: "1px solid #3c3c3c",
  borderRadius: "4px",
  width: "200px",
};

// --- Component ---

function CrossRigPage() {
  const { selectBead } = useBeadSelection();
  const [filters, setFilters] = useState<CrossRigFilterState>(emptyFilters);
  const [groupMode, setGroupMode] = useState<GroupMode>("rig");
  const [searchText, setSearchText] = useState("");
  const [excludeNoise, setExcludeNoise] = useState(true);

  const { beads, count, rigStats, isLoading, error, refresh } = useCrossRigBeads({
    exclude_noise: excludeNoise,
    search: searchText || undefined,
  });

  // Client-side filtering
  const filteredBeads = useMemo(() => {
    return beads.filter((bead: any) => {
      if (filters.statuses.size > 0 && !filters.statuses.has(bead.status)) return false;
      if (filters.types.size > 0 && !filters.types.has(bead.issue_type)) return false;
      if (filters.priorities.size > 0 && !filters.priorities.has(bead.priority)) return false;
      if (filters.rigs.size > 0 && !filters.rigs.has(bead._rig_db)) return false;
      return true;
    });
  }, [beads, filters]);

  // Extract facets
  const facets = useMemo(() => {
    const statuses = new Set<string>();
    const types = new Set<string>();
    const priorities = new Set<number>();
    const rigs = new Set<string>();

    for (const bead of beads as any[]) {
      statuses.add(bead.status);
      types.add(bead.issue_type);
      priorities.add(bead.priority);
      if (bead._rig_db) rigs.add(bead._rig_db);
    }
    return { statuses, types, priorities, rigs };
  }, [beads]);

  // Grouping
  const groups = useMemo(() => {
    if (groupMode === "none") return new Map([["All", filteredBeads]]);
    const map = new Map<string, any[]>();
    for (const bead of filteredBeads as any[]) {
      let key: string;
      switch (groupMode) {
        case "rig": key = bead._rig_db ?? "unknown"; break;
        case "type": key = bead.issue_type; break;
        case "status": key = bead.status; break;
      }
      const group = map.get(key);
      if (group) group.push(bead);
      else map.set(key, [bead]);
    }
    return map;
  }, [filteredBeads, groupMode]);

  // Toggle helpers
  const toggle = useCallback(
    (field: keyof CrossRigFilterState, value: any) => {
      const next = new Set(filters[field] as Set<any>);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      setFilters({ ...filters, [field]: next });
    },
    [filters]
  );

  const hasActiveFilters =
    filters.statuses.size > 0 ||
    filters.types.size > 0 ||
    filters.priorities.size > 0 ||
    filters.rigs.size > 0;

  return (
    <div style={containerStyle}>
      {/* Header */}
      <div style={headerStyle}>
        <h2 style={{ margin: 0, fontSize: "16px" }}>Cross-Rig Beads</h2>
        <input
          type="text"
          placeholder="Search titles..."
          style={searchStyle}
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
        />
        <label style={{ fontSize: "11px", color: "#888", display: "flex", alignItems: "center", gap: "4px" }}>
          <input
            type="checkbox"
            checked={excludeNoise}
            onChange={(e) => setExcludeNoise(e.target.checked)}
          />
          Hide noise
        </label>
        <select
          style={selectStyle}
          value={groupMode}
          onChange={(e) => setGroupMode(e.target.value as GroupMode)}
        >
          <option value="none">No grouping</option>
          <option value="rig">Group by Rig</option>
          <option value="type">Group by Type</option>
          <option value="status">Group by Status</option>
        </select>
        <button
          type="button"
          onClick={refresh}
          style={{ ...chipStyle(false), cursor: "pointer" }}
        >
          Refresh
        </button>
      </div>

      {/* Rig filter - own row */}
      {facets.rigs.size > 0 && (
        <div style={{ ...filterPanelStyle, borderBottom: "none", paddingBottom: "4px" }}>
          <div style={sectionStyle}>
            <span style={sectionLabelStyle}>Rigs</span>
            <div style={chipContainerStyle}>
              {[...facets.rigs].sort().map((rig) => (
                <button
                  key={rig}
                  type="button"
                  style={chipStyle(filters.rigs.has(rig))}
                  onClick={() => toggle("rigs", rig)}
                >
                  {rig}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Other filter chips */}
      <div style={filterPanelStyle}>
        {/* Statuses */}
        <div style={sectionStyle}>
          <span style={sectionLabelStyle}>Status</span>
          <div style={chipContainerStyle}>
            {[...facets.statuses].sort().map((s) => (
              <button
                key={s}
                type="button"
                style={chipStyle(filters.statuses.has(s))}
                onClick={() => toggle("statuses", s)}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Types */}
        <div style={sectionStyle}>
          <span style={sectionLabelStyle}>Type</span>
          <div style={chipContainerStyle}>
            {[...facets.types].sort().map((t) => (
              <button
                key={t}
                type="button"
                style={chipStyle(filters.types.has(t))}
                onClick={() => toggle("types", t)}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Priorities */}
        <div style={sectionStyle}>
          <span style={sectionLabelStyle}>Priority</span>
          <div style={chipContainerStyle}>
            {[...facets.priorities].sort().map((p) => (
              <button
                key={p}
                type="button"
                style={chipStyle(filters.priorities.has(p))}
                onClick={() => toggle("priorities", p)}
              >
                P{p}
              </button>
            ))}
          </div>
        </div>

        {/* Clear */}
        {hasActiveFilters && (
          <button
            type="button"
            style={{ ...chipStyle(false), borderColor: "#ef4444", color: "#ef4444" }}
            onClick={() => setFilters(emptyFilters())}
          >
            Clear all
          </button>
        )}
      </div>

      {/* Count bar */}
      <div style={countBarStyle}>
        {filteredBeads.length} of {count} beads
        {Object.keys(rigStats).length > 0 && ` across ${Object.keys(rigStats).length} rigs`}
        {isLoading && " (loading...)"}
        {error && ` — Error: ${error.message}`}
      </div>

      {/* Bead list */}
      <div style={listStyle}>
        {[...groups.entries()].map(([groupName, groupBeads]) => (
          <div key={groupName}>
            {groupMode !== "none" && (
              <div style={groupHeaderStyle}>
                {groupName} ({groupBeads.length})
              </div>
            )}
            {groupBeads.map((bead: any) => (
              <div key={bead.id} style={rowStyle} onClick={() => selectBead(bead.id)}>
                <span style={rigBadgeStyle}>{bead._rig_db}</span>
                <BeadStatusBadge status={bead.status} />
                <span style={{ fontSize: "10px", color: "#666", minWidth: "32px" }}>
                  P{bead.priority}
                </span>
                <span style={{ fontSize: "10px", color: "#888", minWidth: "50px" }}>
                  {bead.issue_type}
                </span>
                <span style={{ color: "#ccc", fontSize: "12px", fontFamily: "monospace", minWidth: "80px" }}>
                  {bead.id}
                </span>
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {bead.title}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
