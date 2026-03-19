/**
 * Mermaid diagram renderer using the official mermaid.js library.
 * Renders Mermaid syntax as SVG with full dagre/elk layout support.
 * Supports pan (click-drag) and zoom (mouse wheel).
 */
import { type CSSProperties, useCallback, useEffect, useRef, useState } from 'react'

const containerStyle: CSSProperties = {
  width: '100%',
  height: '100%',
  backgroundColor: '#1e1e1e',
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
}

const toolbarStyle: CSSProperties = {
  display: 'flex',
  gap: '8px',
  padding: '8px 12px',
  backgroundColor: '#252526',
  borderBottom: '1px solid #3c3c3c',
  alignItems: 'center',
  flexShrink: 0,
}

const btnStyle: CSSProperties = {
  padding: '4px 10px',
  fontSize: '11px',
  border: '1px solid #3c3c3c',
  borderRadius: '4px',
  backgroundColor: '#1e1e1e',
  color: '#ccc',
  cursor: 'pointer',
}

const activeBtnStyle: CSSProperties = {
  ...btnStyle,
  backgroundColor: '#007acc',
  borderColor: '#007acc',
  color: '#fff',
}

const viewportStyle: CSSProperties = {
  flex: 1,
  overflow: 'hidden',
  cursor: 'grab',
  position: 'relative',
  minHeight: 0,
}

const zoomLabelStyle: CSSProperties = {
  fontSize: '11px',
  color: '#666',
  minWidth: '40px',
  textAlign: 'center',
}

interface MermaidViewProps {
  /** Mermaid syntax string */
  mermaid: string
  /** Theme: dark or default */
  theme?: 'dark' | 'default'
}

let mermaidInitialized = false
let renderCounter = 0

const MIN_ZOOM = 0.1
const MAX_ZOOM = 3
const ZOOM_STEP = 0.1

export function MermaidView({ mermaid: mermaidSyntax, theme = 'dark' }: MermaidViewProps) {
  const [svg, setSvg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState<string | null>(null)

  // Pan/zoom state
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const isDragging = useRef(false)
  const dragStart = useRef({ x: 0, y: 0 })
  const panStart = useRef({ x: 0, y: 0 })
  const viewportRef = useRef<HTMLDivElement>(null)

  // Reset pan/zoom when diagram changes
  useEffect(() => {
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }, [mermaidSyntax])

  // Render mermaid
  useEffect(() => {
    let cancelled = false

    async function render() {
      setLoading(true)
      setError(null)

      try {
        const mermaid = (await import('mermaid')).default

        if (!mermaidInitialized) {
          mermaid.initialize({
            startOnLoad: false,
            theme: theme === 'dark' ? 'dark' : 'default',
            securityLevel: 'loose',
            flowchart: {
              useMaxWidth: false,
              htmlLabels: true,
              curve: 'basis',
            },
          })
          mermaidInitialized = true
        }

        const id = `mermaid-diagram-${++renderCounter}`
        const { svg: renderedSvg } = await mermaid.render(id, mermaidSyntax)

        if (!cancelled) {
          setSvg(renderedSvg)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err))
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    render()
    return () => { cancelled = true }
  }, [mermaidSyntax, theme])

  // Mouse wheel zoom
  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return

    function handleWheel(e: WheelEvent) {
      e.preventDefault()
      const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP
      setZoom((prev) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, prev + delta)))
    }

    viewport.addEventListener('wheel', handleWheel, { passive: false })
    return () => viewport.removeEventListener('wheel', handleWheel)
  }, [])

  // Mouse drag pan
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return
    isDragging.current = true
    dragStart.current = { x: e.clientX, y: e.clientY }
    panStart.current = { ...pan }
    e.currentTarget.style.cursor = 'grabbing'
  }, [pan])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging.current) return
    const dx = e.clientX - dragStart.current.x
    const dy = e.clientY - dragStart.current.y
    setPan({
      x: panStart.current.x + dx,
      y: panStart.current.y + dy,
    })
  }, [])

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    isDragging.current = false
    e.currentTarget.style.cursor = 'grab'
  }, [])

  const handleMouseLeave = useCallback((e: React.MouseEvent) => {
    isDragging.current = false
    e.currentTarget.style.cursor = 'grab'
  }, [])

  // Zoom controls
  const handleZoomIn = useCallback(() => {
    setZoom((prev) => Math.min(MAX_ZOOM, prev + ZOOM_STEP))
  }, [])

  const handleZoomOut = useCallback(() => {
    setZoom((prev) => Math.max(MIN_ZOOM, prev - ZOOM_STEP))
  }, [])

  const handleZoomReset = useCallback(() => {
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }, [])

  const handleFitToView = useCallback(() => {
    const viewport = viewportRef.current
    const wrapper = viewport?.querySelector('.mermaid-svg-wrapper svg') as SVGSVGElement | null
    if (!viewport || !wrapper) return

    const vw = viewport.clientWidth
    const vh = viewport.clientHeight
    const sw = wrapper.getBoundingClientRect().width / zoom
    const sh = wrapper.getBoundingClientRect().height / zoom

    if (sw === 0 || sh === 0) return

    const fitZoom = Math.min(vw / sw, vh / sh, MAX_ZOOM) * 0.9 // 90% to add padding
    setZoom(fitZoom)
    setPan({ x: 0, y: 0 })
  }, [zoom])

  const copyToClipboard = useCallback((text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(label)
      setTimeout(() => setCopied(null), 2000)
    })
  }, [])

  const downloadSvg = useCallback(() => {
    if (!svg) return
    const blob = new Blob([svg], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'diagram.svg'
    a.click()
    URL.revokeObjectURL(url)
  }, [svg])

  const zoomPercent = `${Math.round(zoom * 100)}%`

  return (
    <div style={containerStyle}>
      <div style={toolbarStyle}>
        <span style={{ fontSize: '11px', color: '#888' }}>Mermaid</span>
        <button type="button" style={btnStyle} onClick={() => copyToClipboard(mermaidSyntax, 'Mermaid')}>
          {copied === 'Mermaid' ? 'Copied!' : 'Copy Mermaid'}
        </button>
        {svg && (
          <>
            <button type="button" style={btnStyle} onClick={() => copyToClipboard(svg, 'SVG')}>
              {copied === 'SVG' ? 'Copied!' : 'Copy SVG'}
            </button>
            <button type="button" style={btnStyle} onClick={downloadSvg}>Download SVG</button>
          </>
        )}
        <div style={{ flex: 1 }} />
        {svg && (
          <>
            <button type="button" style={btnStyle} onClick={handleZoomOut} title="Zoom out">−</button>
            <span style={zoomLabelStyle}>{zoomPercent}</span>
            <button type="button" style={btnStyle} onClick={handleZoomIn} title="Zoom in">+</button>
            <button type="button" style={btnStyle} onClick={handleZoomReset} title="Reset zoom">1:1</button>
            <button type="button" style={btnStyle} onClick={handleFitToView} title="Fit to view">Fit</button>
          </>
        )}
      </div>

      <div
        ref={viewportRef}
        style={viewportStyle}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
      >
        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <span style={{ color: '#888' }}>Rendering diagram...</span>
          </div>
        )}
        {error && (
          <div style={{ color: '#f14c4c', padding: '16px' }}>
            <div>Mermaid render error:</div>
            <pre style={{ fontSize: '11px', marginTop: '8px', whiteSpace: 'pre-wrap' }}>{error}</pre>
            <div style={{ marginTop: '12px', color: '#888', fontSize: '11px' }}>
              Mermaid source:
              <pre style={{ marginTop: '4px', padding: '8px', backgroundColor: '#2d2d2d', borderRadius: '4px' }}>
                {mermaidSyntax}
              </pre>
            </div>
          </div>
        )}
        {svg && !loading && (
          <div
            dangerouslySetInnerHTML={{ __html: svg }}
            className="mermaid-svg-wrapper"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: 'top left',
              padding: '16px',
              display: 'inline-block',
            }}
          />
        )}
      </div>
    </div>
  )
}
