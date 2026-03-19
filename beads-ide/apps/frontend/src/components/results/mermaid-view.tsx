/**
 * Mermaid diagram renderer using the official mermaid.js library.
 * Renders Mermaid syntax as SVG with full dagre/elk layout support.
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

const svgContainerStyle: CSSProperties = {
  flex: 1,
  padding: '16px',
  overflow: 'auto',
  minHeight: 0,
}

interface MermaidViewProps {
  /** Mermaid syntax string */
  mermaid: string
  /** Theme: dark or default */
  theme?: 'dark' | 'default'
}

let mermaidInitialized = false
let renderCounter = 0

export function MermaidView({ mermaid: mermaidSyntax, theme = 'dark' }: MermaidViewProps) {
  const [svg, setSvg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

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
              useMaxWidth: true,
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
      </div>

      <div ref={containerRef} style={svgContainerStyle}>
        {loading && <span style={{ color: '#888' }}>Rendering diagram...</span>}
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
          />
        )}
      </div>
    </div>
  )
}
