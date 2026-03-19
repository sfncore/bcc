/**
 * Graph controls panel for dense graph simplification.
 * Provides toggles for clustering, focus mode, visual simplification,
 * layout algorithm selection, and metrics overlay.
 */
import type { CSSProperties } from 'react'

/** Available layout algorithms */
export type LayoutAlgorithm = 'force-directed' | 'hierarchical' | 'manual'

/** Available metric overlays for node size/color */
export type MetricOverlay =
  | 'none'
  | 'pagerank'
  | 'betweenness'
  | 'eigenvector'
  | 'degree'
  | 'criticalPath'

export interface GraphSimplificationState {
  /** Collapse epic children into cluster nodes */
  epicClustering: boolean
  /** Show only N-hop neighborhood of selected node */
  focusMode: boolean
  /** Number of hops to show in focus mode (default 2) */
  focusHops: number
  /** Enable semantic zoom (hide labels when zoomed out) */
  semanticZoom: boolean
  /** Enable fisheye distortion around cursor */
  fisheyeMode: boolean
  /** Currently selected node ID (for focus mode) */
  selectedNodeId: string | null
  /** Active layout algorithm */
  layout: LayoutAlgorithm
  /** Active metric overlay */
  metricOverlay: MetricOverlay
}

export const DEFAULT_SIMPLIFICATION_STATE: GraphSimplificationState = {
  epicClustering: false,
  focusMode: false,
  focusHops: 2,
  semanticZoom: true,
  fisheyeMode: false,
  selectedNodeId: null,
  layout: 'hierarchical',
  metricOverlay: 'none',
}

export interface DensityHealth {
  density: number
  nodeCount: number
  edgeCount: number
  level: 'healthy' | 'warning' | 'critical'
}

export function getDensityHealth(
  density: number,
  nodeCount: number,
  edgeCount: number
): DensityHealth {
  let level: DensityHealth['level'] = 'healthy'
  if (density > 0.12) {
    level = 'critical'
  } else if (density > 0.1) {
    level = 'warning'
  }
  return { density, nodeCount, edgeCount, level }
}

interface GraphControlsProps {
  state: GraphSimplificationState
  onStateChange: (state: GraphSimplificationState) => void
  density: DensityHealth
}

const controlsContainerStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
  padding: '12px',
  backgroundColor: '#252526',
  borderRadius: '6px',
  fontSize: '12px',
}

const sectionStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
}

const sectionTitleStyle: CSSProperties = {
  fontSize: '11px',
  fontWeight: 600,
  color: '#888',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
}

const controlRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '8px',
}

const labelStyle: CSSProperties = {
  color: '#ccc',
  fontSize: '12px',
}

const checkboxStyle: CSSProperties = {
  width: '14px',
  height: '14px',
  accentColor: '#007acc',
  cursor: 'pointer',
}

const selectStyle: CSSProperties = {
  backgroundColor: '#3c3c3c',
  border: '1px solid #555',
  borderRadius: '3px',
  color: '#ccc',
  padding: '2px 6px',
  fontSize: '11px',
}

const healthIndicatorBaseStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '8px',
  borderRadius: '4px',
  fontSize: '11px',
}

function getHealthColor(level: DensityHealth['level']): string {
  switch (level) {
    case 'critical':
      return '#f14c4c'
    case 'warning':
      return '#cca700'
    case 'healthy':
      return '#89d185'
  }
}

function getHealthBgColor(level: DensityHealth['level']): string {
  switch (level) {
    case 'critical':
      return 'rgba(241, 76, 76, 0.15)'
    case 'warning':
      return 'rgba(204, 167, 0, 0.15)'
    case 'healthy':
      return 'rgba(137, 209, 133, 0.15)'
  }
}

export function GraphControls({ state, onStateChange, density }: GraphControlsProps) {
  const updateState = (partial: Partial<GraphSimplificationState>) => {
    onStateChange({ ...state, ...partial })
  }

  return (
    // biome-ignore lint/a11y/useSemanticElements: landmark region container, section requires heading per WCAG
    <div style={controlsContainerStyle} role="region" aria-label="Graph display controls">
      {/* Density Health Indicator */}
      <div
        style={{
          ...healthIndicatorBaseStyle,
          backgroundColor: getHealthBgColor(density.level),
          border: `1px solid ${getHealthColor(density.level)}`,
        }}
        // biome-ignore lint/a11y/useSemanticElements: intentional ARIA status role on density health indicator
        role="status"
        aria-label={`Graph density ${density.level}: ${(density.density * 100).toFixed(1)}% with ${density.nodeCount} nodes and ${density.edgeCount} edges`}
      >
        <span
          style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            backgroundColor: getHealthColor(density.level),
          }}
          aria-hidden="true"
        />
        <span style={{ color: getHealthColor(density.level), fontWeight: 500 }}>
          Density: {(density.density * 100).toFixed(1)}%
        </span>
        <span style={{ color: '#888', marginLeft: 'auto' }}>
          {density.nodeCount} nodes, {density.edgeCount} edges
        </span>
      </div>

      {/* Layout Section */}
      <fieldset style={{ ...sectionStyle, border: 'none', padding: 0, margin: 0 }}>
        <legend style={sectionTitleStyle}>Layout</legend>
        <div style={controlRowStyle}>
          <label htmlFor="layout-select" style={labelStyle}>
            Algorithm
          </label>
          <select
            id="layout-select"
            value={state.layout}
            onChange={(e) => updateState({ layout: e.target.value as LayoutAlgorithm })}
            style={selectStyle}
            aria-label="Layout algorithm"
          >
            <option value="force-directed">Force-Directed</option>
            <option value="hierarchical">Hierarchical</option>
            <option value="manual">Manual</option>
          </select>
        </div>
      </fieldset>

      {/* Metrics Overlay Section */}
      <fieldset style={{ ...sectionStyle, border: 'none', padding: 0, margin: 0 }}>
        <legend style={sectionTitleStyle}>Metrics Overlay</legend>
        <div style={controlRowStyle}>
          <label htmlFor="metric-select" style={labelStyle}>
            Metric
          </label>
          <select
            id="metric-select"
            value={state.metricOverlay}
            onChange={(e) => updateState({ metricOverlay: e.target.value as MetricOverlay })}
            style={selectStyle}
            aria-label="Metric overlay for node appearance"
          >
            <option value="none">None</option>
            <option value="pagerank">PageRank</option>
            <option value="betweenness">Betweenness</option>
            <option value="eigenvector">Eigenvector</option>
            <option value="degree">Degree</option>
            <option value="criticalPath">Critical Path</option>
          </select>
        </div>
        {state.metricOverlay !== 'none' && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '10px',
              color: '#888',
            }}
          >
            <span
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: '#2d5a9e',
              }}
            />
            Low
            <span
              style={{
                flex: 1,
                height: '4px',
                background: 'linear-gradient(to right, #2d5a9e, #f14c4c)',
                borderRadius: '2px',
              }}
            />
            High
            <span
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: '#f14c4c',
              }}
            />
          </div>
        )}
      </fieldset>

      {/* Clustering Section */}
      <fieldset style={{ ...sectionStyle, border: 'none', padding: 0, margin: 0 }}>
        <legend style={sectionTitleStyle}>Clustering</legend>
        <div style={controlRowStyle}>
          <label style={labelStyle}>
            <input
              type="checkbox"
              checked={state.epicClustering}
              onChange={(e) => updateState({ epicClustering: e.target.checked })}
              style={checkboxStyle}
              aria-describedby="epic-clustering-desc"
            />{' '}
            Epic Clustering
          </label>
        </div>
        <span id="epic-clustering-desc" style={{ display: 'none' }}>
          Collapse epic children into cluster nodes for simplified view
        </span>
      </fieldset>

      {/* Focus Mode Section */}
      <fieldset style={{ ...sectionStyle, border: 'none', padding: 0, margin: 0 }}>
        <legend style={sectionTitleStyle}>Focus Mode</legend>
        <div style={controlRowStyle}>
          <label style={labelStyle}>
            <input
              type="checkbox"
              checked={state.focusMode}
              onChange={(e) => updateState({ focusMode: e.target.checked })}
              style={checkboxStyle}
            />{' '}
            Enable Focus
          </label>
          <label
            htmlFor="focus-hops-select"
            style={{ position: 'absolute', width: '1px', height: '1px', overflow: 'hidden' }}
          >
            Number of hops
          </label>
          <select
            id="focus-hops-select"
            value={state.focusHops}
            onChange={(e) => updateState({ focusHops: Number.parseInt(e.target.value, 10) })}
            style={selectStyle}
            disabled={!state.focusMode}
            aria-label="Number of hops to show around focused node"
          >
            <option value={1}>1 hop</option>
            <option value={2}>2 hops</option>
            <option value={3}>3 hops</option>
          </select>
        </div>
        {state.focusMode && !state.selectedNodeId && (
          // biome-ignore lint/a11y/useSemanticElements: inline status hint on span, output element is block-level
          <span style={{ color: '#888', fontSize: '10px', fontStyle: 'italic' }} role="status">
            Click a node to focus
          </span>
        )}
        {state.focusMode && state.selectedNodeId && (
          // biome-ignore lint/a11y/useSemanticElements: inline status hint on span, output element is block-level
          <span style={{ color: '#007acc', fontSize: '10px' }} role="status" aria-live="polite">
            Focused: {state.selectedNodeId}
          </span>
        )}
      </fieldset>

      {/* Visual Simplification Section */}
      <fieldset style={{ ...sectionStyle, border: 'none', padding: 0, margin: 0 }}>
        <legend style={sectionTitleStyle}>Visual Simplification</legend>
        <div style={controlRowStyle}>
          <label style={labelStyle}>
            <input
              type="checkbox"
              checked={state.semanticZoom}
              onChange={(e) => updateState({ semanticZoom: e.target.checked })}
              style={checkboxStyle}
            />{' '}
            Semantic Zoom
          </label>
        </div>
        <div style={controlRowStyle}>
          <label style={labelStyle}>
            <input
              type="checkbox"
              checked={state.fisheyeMode}
              onChange={(e) => updateState({ fisheyeMode: e.target.checked })}
              style={checkboxStyle}
            />{' '}
            Fisheye Distortion
          </label>
        </div>
      </fieldset>
    </div>
  )
}
