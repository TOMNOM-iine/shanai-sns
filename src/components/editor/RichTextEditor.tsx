'use client'

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import DOMPurify from 'dompurify'

export interface RichTextEditorHandle {
  insertText: (text: string) => void
  focus: () => void
  getPlainText: () => string
  setHtml: (html: string) => void
}

interface RichTextEditorProps {
  value: string
  onChange: (html: string, plainText: string) => void
  placeholder?: string
  className?: string
  disabled?: boolean
}

const ALLOWED_TAGS = [
  'a', 'b', 'strong', 'i', 'em', 'u', 's', 'strike',
  'p', 'br', 'div', 'ul', 'ol', 'li', 'blockquote',
  'code', 'pre', 'span', 'h1', 'h2', 'h3'
]

const ALLOWED_ATTR = ['href', 'target', 'rel', 'class']

function sanitize(html: string) {
  return DOMPurify.sanitize(html, { ALLOWED_TAGS, ALLOWED_ATTR })
}

const RichTextEditor = forwardRef<RichTextEditorHandle, RichTextEditorProps>(
  ({ value, onChange, placeholder, className, disabled }, ref) => {
    const editorRef = useRef<HTMLDivElement>(null)
    const [showEmoji, setShowEmoji] = useState(false)
    const emojiList = ['😀', '😂', '😍', '👍', '🎉', '🙏', '🔥', '😮', '😢', '🤔', '✅', '⭐']
    useEffect(() => {
      const el = editorRef.current
      if (!el) return
      const sanitized = sanitize(value || '')
      if (el.innerHTML !== sanitized) {
        el.innerHTML = sanitized
      }
    }, [value])

    const emitChange = () => {
      const el = editorRef.current
      if (!el) return
      const sanitized = sanitize(el.innerHTML)
      if (el.innerHTML !== sanitized) {
        el.innerHTML = sanitized
      }
      const plainText = el.innerText || ''
      onChange(sanitized, plainText)
    }

    const exec = (command: string, valueArg?: string) => {
      if (disabled) return
      editorRef.current?.focus()
      document.execCommand(command, false, valueArg)
      emitChange()
    }

    const insertLink = () => {
      if (disabled) return
      const url = window.prompt('リンクURLを入力してください')
      if (!url) return
      exec('createLink', url)
      const selection = window.getSelection()
      if (selection?.anchorNode?.parentElement?.tagName === 'A') {
        selection.anchorNode.parentElement.setAttribute('target', '_blank')
        selection.anchorNode.parentElement.setAttribute('rel', 'noreferrer')
      }
    }

    const insertEmoji = (emoji: string) => {
      if (disabled) return
      editorRef.current?.focus()
      document.execCommand('insertText', false, emoji)
      emitChange()
      setShowEmoji(false)
    }

    useImperativeHandle(ref, () => ({
      insertText: (text: string) => {
        if (disabled) return
        editorRef.current?.focus()
        document.execCommand('insertText', false, text)
        emitChange()
      },
      focus: () => {
        editorRef.current?.focus()
      },
      getPlainText: () => {
        return editorRef.current?.innerText || ''
      },
      setHtml: (html: string) => {
        if (!editorRef.current) return
        editorRef.current.innerHTML = sanitize(html)
        emitChange()
      },
    }))

    return (
      <div className={`border-2 border-black bg-white ${className || ''}`}>
        <div className="flex flex-wrap gap-2 p-2 border-b-2 border-black bg-gray-50">
          <button type="button" onClick={() => exec('bold')} className="pixel-btn text-xs">
            B
          </button>
          <button type="button" onClick={() => exec('italic')} className="pixel-btn text-xs">
            I
          </button>
          <button type="button" onClick={() => exec('underline')} className="pixel-btn text-xs">
            U
          </button>
          <button type="button" onClick={() => exec('strikeThrough')} className="pixel-btn text-xs">
            S
          </button>
          <button type="button" onClick={() => exec('insertUnorderedList')} className="pixel-btn text-xs">
            •
          </button>
          <button type="button" onClick={() => exec('insertOrderedList')} className="pixel-btn text-xs">
            1.
          </button>
          <button type="button" onClick={() => exec('formatBlock', '<blockquote>')} className="pixel-btn text-xs">
            〃
          </button>
          <button type="button" onClick={() => exec('formatBlock', '<pre>')} className="pixel-btn text-xs">
            {'</>'}
          </button>
          <button type="button" onClick={() => exec('formatBlock', '<h2>')} className="pixel-btn text-xs">
            H2
          </button>
          <button type="button" onClick={insertLink} className="pixel-btn text-xs">
            🔗
          </button>
          <button
            type="button"
            onClick={() => setShowEmoji((prev) => !prev)}
            className="pixel-btn text-xs"
          >
            🙂
          </button>
          <button type="button" onClick={() => exec('removeFormat')} className="pixel-btn text-xs">
            ✕
          </button>
        </div>
        {showEmoji && (
          <div className="flex flex-wrap gap-2 p-2 border-b-2 border-black bg-gray-50">
            {emojiList.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => insertEmoji(emoji)}
                className="pixel-btn text-xs"
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
        <div
          ref={editorRef}
          contentEditable={!disabled}
          onInput={emitChange}
          className={`min-h-[120px] p-3 text-base outline-none ${
            disabled ? 'bg-gray-100 text-gray-500' : ''
          }`}
          data-placeholder={placeholder || ''}
          suppressContentEditableWarning
        />
      </div>
    )
  }
)

RichTextEditor.displayName = 'RichTextEditor'

export default RichTextEditor
