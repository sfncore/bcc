/**
 * Tiptap-based markdown editor for step descriptions.
 * Converts markdown to HTML for editing, and back to markdown on save.
 */
import './markdown-editor.css'
import Placeholder from '@tiptap/extension-placeholder'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { marked } from 'marked'
import { type CSSProperties, useCallback, useEffect, useMemo, useRef } from 'react'
import TurndownService from 'turndown'

export interface MarkdownEditorProps {
  /** Current content (markdown) */
  value: string
  /** Callback when content changes (returns markdown) */
  onChange: (value: string) => void
  /** Placeholder text */
  placeholder?: string
  /** Minimum height */
  minHeight?: string
  /** Whether the editor is read-only */
  readOnly?: boolean
  /** ID of the element that labels this editor (for accessibility) */
  'aria-labelledby'?: string
  /** ID of the element that describes this editor (e.g. error message) */
  'aria-describedby'?: string
}

const editorContainerStyle: CSSProperties = {
  backgroundColor: '#111827',
  border: '1px solid #374151',
  borderRadius: '6px',
}

const toolbarStyle: CSSProperties = {
  display: 'flex',
  gap: '2px',
  padding: '6px 8px',
  borderBottom: '1px solid #374151',
  backgroundColor: '#0f172a',
  flexWrap: 'wrap',
  flexShrink: 0,
}

const toolbarButtonStyle = (isActive: boolean): CSSProperties => ({
  padding: '4px 8px',
  fontSize: '12px',
  fontWeight: 500,
  color: isActive ? '#fff' : '#9ca3af',
  backgroundColor: isActive ? '#3b82f6' : 'transparent',
  border: 'none',
  borderRadius: '4px',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: '28px',
  transition: 'all 0.1s ease',
})

const toolbarDividerStyle: CSSProperties = {
  width: '1px',
  backgroundColor: '#374151',
  margin: '0 4px',
  alignSelf: 'stretch',
}

const contentStyle = (minHeight: string): CSSProperties => ({
  padding: '12px 14px',
  minHeight,
})

// Configure marked for safe parsing
marked.setOptions({
  breaks: true,
  gfm: true,
})

/**
 * Convert markdown to HTML for Tiptap.
 */
function markdownToHtml(markdown: string): string {
  if (!markdown) return ''
  try {
    return marked.parse(markdown) as string
  } catch {
    return markdown
  }
}

/**
 * Tiptap markdown editor with toolbar and keyboard shortcuts.
 */
export function MarkdownEditor({
  value,
  onChange,
  placeholder = 'Enter description...',
  minHeight = '200px',
  readOnly = false,
  'aria-labelledby': ariaLabelledBy,
  'aria-describedby': ariaDescribedBy,
}: MarkdownEditorProps) {
  // Create turndown service for HTML -> Markdown conversion
  const turndownService = useMemo(() => {
    const service = new TurndownService({
      headingStyle: 'atx',
      codeBlockStyle: 'fenced',
      bulletListMarker: '-',
    })
    return service
  }, [])

  // Track if we're currently updating from external value
  const isExternalUpdate = useRef(false)
  // Track the last value we received
  const lastValueRef = useRef(value)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
        codeBlock: {
          HTMLAttributes: {
            class: 'code-block',
          },
        },
      }),
      Placeholder.configure({
        placeholder,
      }),
    ],
    content: markdownToHtml(value),
    editable: !readOnly,
    editorProps: {
      attributes: {
        role: 'textbox',
        'aria-multiline': 'true',
        ...(ariaLabelledBy ? { 'aria-labelledby': ariaLabelledBy } : {}),
        ...(ariaDescribedBy ? { 'aria-describedby': ariaDescribedBy } : {}),
      },
    },
    onUpdate: ({ editor }) => {
      // Don't fire onChange if this update was from external value sync
      if (isExternalUpdate.current) {
        return
      }

      // Convert HTML back to markdown
      const html = editor.getHTML()
      const markdown = turndownService.turndown(html)

      // Only call onChange if the markdown actually changed
      if (markdown !== lastValueRef.current) {
        lastValueRef.current = markdown
        onChange(markdown)
      }
    },
  })

  // Sync external value changes
  useEffect(() => {
    if (editor && value !== lastValueRef.current) {
      isExternalUpdate.current = true
      lastValueRef.current = value
      editor.commands.setContent(markdownToHtml(value))
      // Use setTimeout to ensure the flag is reset after the update cycle
      setTimeout(() => {
        isExternalUpdate.current = false
      }, 0)
    }
  }, [editor, value])

  // Update editable state
  useEffect(() => {
    if (editor) {
      editor.setEditable(!readOnly)
    }
  }, [editor, readOnly])

  const toggleBold = useCallback(() => {
    editor?.chain().focus().toggleBold().run()
  }, [editor])

  const toggleItalic = useCallback(() => {
    editor?.chain().focus().toggleItalic().run()
  }, [editor])

  const toggleCode = useCallback(() => {
    editor?.chain().focus().toggleCode().run()
  }, [editor])

  const toggleCodeBlock = useCallback(() => {
    editor?.chain().focus().toggleCodeBlock().run()
  }, [editor])

  const toggleBulletList = useCallback(() => {
    editor?.chain().focus().toggleBulletList().run()
  }, [editor])

  const toggleOrderedList = useCallback(() => {
    editor?.chain().focus().toggleOrderedList().run()
  }, [editor])

  const setHeading = useCallback(
    (level: 1 | 2 | 3) => {
      editor?.chain().focus().toggleHeading({ level }).run()
    },
    [editor]
  )

  if (!editor) {
    return null
  }

  return (
    <div style={editorContainerStyle}>
      {!readOnly && (
        <div style={toolbarStyle}>
          <button
            type="button"
            onClick={() => setHeading(1)}
            style={toolbarButtonStyle(editor.isActive('heading', { level: 1 }))}
            title="Heading 1 (Ctrl+Alt+1)"
          >
            H1
          </button>
          <button
            type="button"
            onClick={() => setHeading(2)}
            style={toolbarButtonStyle(editor.isActive('heading', { level: 2 }))}
            title="Heading 2 (Ctrl+Alt+2)"
          >
            H2
          </button>
          <button
            type="button"
            onClick={() => setHeading(3)}
            style={toolbarButtonStyle(editor.isActive('heading', { level: 3 }))}
            title="Heading 3 (Ctrl+Alt+3)"
          >
            H3
          </button>

          <div style={toolbarDividerStyle} />

          <button
            type="button"
            onClick={toggleBold}
            style={toolbarButtonStyle(editor.isActive('bold'))}
            title="Bold (Ctrl+B)"
          >
            B
          </button>
          <button
            type="button"
            onClick={toggleItalic}
            style={toolbarButtonStyle(editor.isActive('italic'))}
            title="Italic (Ctrl+I)"
          >
            I
          </button>
          <button
            type="button"
            onClick={toggleCode}
            style={toolbarButtonStyle(editor.isActive('code'))}
            title="Inline Code (Ctrl+E)"
          >
            {'</>'}
          </button>

          <div style={toolbarDividerStyle} />

          <button
            type="button"
            onClick={toggleBulletList}
            style={toolbarButtonStyle(editor.isActive('bulletList'))}
            title="Bullet List"
          >
            •
          </button>
          <button
            type="button"
            onClick={toggleOrderedList}
            style={toolbarButtonStyle(editor.isActive('orderedList'))}
            title="Numbered List"
          >
            1.
          </button>
          <button
            type="button"
            onClick={toggleCodeBlock}
            style={toolbarButtonStyle(editor.isActive('codeBlock'))}
            title="Code Block"
          >
            {'{ }'}
          </button>
        </div>
      )}

      <div style={contentStyle(minHeight)}>
        <EditorContent editor={editor} />
      </div>
    </div>
  )
}
