import { type CSSProperties, useCallback, useEffect, useRef, useState } from "react";
import { useFormulaDirty } from "../../contexts";
import { useTree, useWorkspaceConfig } from "../../hooks";
import { apiFetch, apiPost } from "../../lib";
import { UnsavedChangesModal } from "../ui/unsaved-changes-modal";
import { DirectoryBrowser } from "./directory-browser";

export interface WorkspaceHeaderProps {
  onFilterChange: (filter: string) => void;
}

const headerContainerStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  borderBottom: "1px solid #333",
};

const topRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "8px 12px 4px",
};

const explorerTitleStyle: CSSProperties = {
  fontSize: "11px",
  fontWeight: 600,
  color: "#bbbbbb",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
};

const iconGroupStyle: CSSProperties = {
  display: "flex",
  gap: "4px",
};

const iconBtnStyle: CSSProperties = {
  background: "none",
  border: "none",
  color: "#888",
  cursor: "pointer",
  padding: "2px",
  borderRadius: "3px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const rootRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  padding: "0 12px 6px",
  gap: "4px",
};

const rootNameStyle: CSSProperties = {
  fontSize: "12px",
  color: "#e2e8f0",
  fontWeight: 500,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const searchContainerStyle: CSSProperties = {
  padding: "0 8px 8px",
};

const searchInputStyle: CSSProperties = {
  width: "100%",
  backgroundColor: "#1e293b",
  color: "#cccccc",
  border: "1px solid #334155",
  borderRadius: "4px",
  padding: "4px 8px",
  fontSize: "12px",
  outline: "none",
  boxSizing: "border-box",
};

function RefreshIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <path d="M14 8A6 6 0 112 8" strokeLinecap="round" />
      <path d="M14 3v5h-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function FolderOpenIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M1.5 2A1.5 1.5 0 000 3.5V5h16v-.5A1.5 1.5 0 0014.5 3H7.71l-1.5-1.2A1.5 1.5 0 005.26 2H1.5zM0 6v6.5A1.5 1.5 0 001.5 14h13a1.5 1.5 0 001.5-1.5V6H0z" />
    </svg>
  );
}

function HomeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 1L1 7h2v6h4V9h2v4h4V7h2L8 1z" />
    </svg>
  );
}

function basename(path: string): string {
  const parts = path.split("/");
  return parts[parts.length - 1] || path;
}

export function WorkspaceHeader({ onFilterChange }: WorkspaceHeaderProps) {
  const { config, setRootPath, addRecentRoot } = useWorkspaceConfig();
  const { refresh, lastUpdated } = useTree();
  const { isDirty } = useFormulaDirty();

  const [showBrowser, setShowBrowser] = useState(false);
  const [showUnsavedModal, setShowUnsavedModal] = useState(false);
  const [filterValue, setFilterValue] = useState("");
  const [gtRoot, setGtRoot] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch GT_ROOT from backend config
  useEffect(() => {
    apiFetch<{ gt_root: string }>("/api/config").then(({ data }) => {
      if (data?.gt_root) setGtRoot(data.gt_root);
    });
  }, []);

  const rootPath = config.rootPath;
  const rootBasename = rootPath ? basename(rootPath) : "";
  const lastUpdatedStr = lastUpdated
    ? `Last updated: ${lastUpdated.toLocaleTimeString()}`
    : "Not yet loaded";

  const handleFilterInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setFilterValue(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        onFilterChange(value);
      }, 150);
    },
    [onFilterChange],
  );

  const handleClearFilter = useCallback(() => {
    setFilterValue("");
    onFilterChange("");
  }, [onFilterChange]);

  const handleGoHome = useCallback(async () => {
    if (!gtRoot) return;
    const { error } = await apiPost<
      { ok: true; root: string; formulaCount: number },
      { path: string }
    >("/api/workspace/open", { path: gtRoot });
    if (!error) {
      setRootPath(gtRoot);
      addRecentRoot(gtRoot);
      window.history.pushState({}, "", "/");
      window.dispatchEvent(new PopStateEvent("popstate"));
      refresh();
    }
  }, [gtRoot, setRootPath, addRecentRoot, refresh]);

  const handleChangeFolder = useCallback(() => {
    // Check if any formula is dirty
    // We use a simple check - just look at the current formula
    const match = window.location.pathname.match(/^\/formula\/(.+)$/);
    if (match) {
      const name = decodeURIComponent(match[1]);
      if (isDirty(name)) {
        setShowUnsavedModal(true);
        return;
      }
    }
    setShowBrowser(true);
  }, [isDirty]);

  const handleUnsavedDiscard = useCallback(() => {
    setShowUnsavedModal(false);
    setShowBrowser(true);
  }, []);

  const handleFolderSelected = useCallback(
    async (path: string) => {
      setShowBrowser(false);
      const { error } = await apiPost<
        { ok: true; root: string; formulaCount: number },
        { path: string }
      >("/api/workspace/open", { path });
      if (!error) {
        setRootPath(path);
        addRecentRoot(path);
        // Reset route
        window.history.pushState({}, "", "/");
        window.dispatchEvent(new PopStateEvent("popstate"));
        refresh();
      }
    },
    [setRootPath, addRecentRoot, refresh],
  );

  return (
    <div style={headerContainerStyle}>
      <div style={topRowStyle}>
        <span style={explorerTitleStyle}>Explorer</span>
        <div style={iconGroupStyle}>
          {gtRoot && (
            <button
              type="button"
              style={iconBtnStyle}
              onClick={handleGoHome}
              title={`Gas Town root: ${gtRoot}`}
              aria-label="Go to Gas Town root"
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "#2a2d2e";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "transparent";
              }}
            >
              <HomeIcon />
            </button>
          )}
          <button
            type="button"
            style={iconBtnStyle}
            onClick={refresh}
            title={lastUpdatedStr}
            aria-label="Refresh tree"
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "#2a2d2e";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
            }}
          >
            <RefreshIcon />
          </button>
          <button
            type="button"
            style={iconBtnStyle}
            onClick={handleChangeFolder}
            title="Change folder"
            aria-label="Change folder"
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "#2a2d2e";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
            }}
          >
            <FolderOpenIcon />
          </button>
        </div>
      </div>

      {rootPath && (
        <div style={rootRowStyle}>
          <span style={rootNameStyle} title={rootPath}>
            {rootBasename}
          </span>
        </div>
      )}

      <div style={searchContainerStyle}>
        <div style={{ position: "relative" }}>
          <input
            type="text"
            style={searchInputStyle}
            placeholder="Filter formulas..."
            value={filterValue}
            onChange={handleFilterInput}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = "#38bdf8";
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = "#334155";
            }}
            aria-label="Filter formulas"
          />
          {filterValue && (
            <button
              type="button"
              style={{
                position: "absolute",
                right: "4px",
                top: "50%",
                transform: "translateY(-50%)",
                background: "none",
                border: "none",
                color: "#888",
                cursor: "pointer",
                fontSize: "14px",
                padding: "2px 4px",
              }}
              onClick={handleClearFilter}
              aria-label="Clear filter"
            >
              &times;
            </button>
          )}
        </div>
      </div>

      <DirectoryBrowser
        isOpen={showBrowser}
        onSelect={handleFolderSelected}
        onCancel={() => setShowBrowser(false)}
        initialPath={rootPath || undefined}
      />

      <UnsavedChangesModal
        isOpen={showUnsavedModal}
        onSave={() => {
          setShowUnsavedModal(false);
          // After save, open browser
          setShowBrowser(true);
        }}
        onDiscard={handleUnsavedDiscard}
        onCancel={() => setShowUnsavedModal(false)}
      />
    </div>
  );
}
