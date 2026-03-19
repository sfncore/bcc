/**
 * Mermaid diagram renderer using FrankenMermaid WASM.
 * Renders Mermaid syntax as SVG or interactive Canvas2D.
 */
import { type CSSProperties, useCallback, useEffect, useRef, useState } from 'react'

const containerStyle: CSSProperties = {
  width: '100%',
  height: '100%',
  backgroundColor: '#1e1e1e',
  overflow: 'auto',
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

const svgContainerStyle: CSSProperties = {
  flex: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '16px',
  overflow: 'auto',
}

interface MermaidViewProps {
  /** Mermaid syntax string */
  mermaid: string
  /** Theme: dark or default */
  theme?: 'dark' | 'default' | 'corporate'
}

export function MermaidView({ mermaid, theme = 'dark' }: MermaidViewProps) {
  const [svg, setSvg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)
  const fmRef = useRef<any>(null)

  // Load FrankenMermaid WASM and render
  useEffect(() => {
    let cancelled = false

    async function render() {
      setLoading(true)
      setError(null)

      try {
        if (!fmRef.current) {
          const fm = await import('@beads-ide/frankenmermaid')
          await fm.default()
          fm.init({ theme })
          fmRef.current = fm
        }

        const result = fmRef.current.renderSvg(mermaid, { theme })
        if (!cancelled) {
          setSvg(result)
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
  }, [mermaid, theme])

  const copyMermaid = useCallback(() => {
    navigator.clipboard.writeText(mermaid).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }, [mermaid])

  const copySvg = useCallback(() => {
    if (svg) {
      navigator.clipboard.writeText(svg).then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      })
    }
  }, [svg])

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

  return (
    <div style={containerStyle}>
      <div style={toolbarStyle}>
        <span style={{ fontSize: '11px', color: '#888' }}>FrankenMermaid WASM</span>
        <button type="button" style={btnStyle} onClick={copyMermaid}>
          {copied ? 'Copied!' : 'Copy Mermaid'}
        </button>
        {svg && (
          <>
            <button type="button" style={btnStyle} onClick={copySvg}>Copy SVG</button>
            <button type="button" style={btnStyle} onClick={downloadSvg}>Download SVG</button>
          </>
        )}
      </div>

      <div style={svgContainerStyle}>
        {loading && <span style={{ color: '#888' }}>Loading WASM...</span>}
        {error && (
          <div style={{ color: '#f14c4c', padding: '16px' }}>
            <div>FrankenMermaid render error:</div>
            <pre style={{ fontSize: '11px', marginTop: '8px', whiteSpace: 'pre-wrap' }}>{error}</pre>
            <div style={{ marginTop: '12px', color: '#888', fontSize: '11px' }}>
              Mermaid source:
              <pre style={{ marginTop: '4px', padding: '8px', backgroundColor: '#2d2d2d', borderRadius: '4px' }}>
                {mermaid}
              </pre>
            </div>
          </div>
        )}
        {svg && !loading && (
          <div
            dangerouslySetInnerHTML={{ __html: svg }}
            style={{ maxWidth: '100%', maxHeight: '100%' }}
          />
        )}
      </div>
    </div>
  )
}
