'use client'

import { useState, useEffect, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { createClient } from '@/lib/supabase/client'
import { upsertSearchDocument } from '@/lib/search/indexDocument'
import JSZip from 'jszip'
import PptxGenJS from 'pptxgenjs'
import { Document as DocxDocument, Packer, Paragraph } from 'docx'

// react-pdfを動的インポート（SSR無効）
const PdfDocument = dynamic(
  () => import('react-pdf').then((mod) => mod.Document),
  { ssr: false }
)
const PdfPage = dynamic(
  () => import('react-pdf').then((mod) => mod.Page),
  { ssr: false }
)

// PDF.js worker設定（クライアントサイドのみ）
if (typeof window !== 'undefined') {
  import('react-pdf').then((pdfjs) => {
    pdfjs.pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.pdfjs.version}/build/pdf.worker.min.mjs`
  })
}

interface FilePreviewProps {
  url: string
  fileName: string
  mimeType: string
  filePath: string
  fileId: string
  onSaved?: () => void
}

interface ExcelData {
  sheets: string[]
  data: { [sheet: string]: string[][] }
}

function htmlToPlainText(html: string) {
  return html
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim()
}

export default function FilePreview({ url, fileName, mimeType, filePath, fileId, onSaved }: FilePreviewProps) {
  const [numPages, setNumPages] = useState<number>(0)
  const [pageNumber, setPageNumber] = useState(1)
  const [wordContent, setWordContent] = useState<string>('')
  const [textContent, setTextContent] = useState<string>('')
  const [excelData, setExcelData] = useState<ExcelData | null>(null)
  const [currentSheet, setCurrentSheet] = useState<string>('')
  const [editedExcelData, setEditedExcelData] = useState<{ [sheet: string]: string[][] }>({})
  const [isEditing, setIsEditing] = useState(false)
  const [editedContent, setEditedContent] = useState<string>('')
  const [pptSlides, setPptSlides] = useState<string[]>([])
  const [editedPptSlides, setEditedPptSlides] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [scale, setScale] = useState(1.0)
  const [saving, setSaving] = useState(false)
  const supabase = createClient()

  const isExcelFile = useCallback(() => {
    return mimeType.includes('spreadsheet') ||
           mimeType.includes('excel') ||
           mimeType.includes('ms-excel') ||
           fileName.endsWith('.xlsx') ||
           fileName.endsWith('.xls') ||
           fileName.endsWith('.csv')
  }, [mimeType, fileName])

  const isCsvFile = useCallback(() => {
    return mimeType.includes('csv') || fileName.endsWith('.csv')
  }, [mimeType, fileName])

  // .docxファイルのみサポート（.docはmammothで非対応）
  const isWordFile = useCallback(() => {
    const isDocx = fileName.toLowerCase().endsWith('.docx') ||
                   mimeType.includes('openxmlformats-officedocument.wordprocessingml')
    return isDocx
  }, [mimeType, fileName])

  // 古い.docファイル（非対応）
  const isOldDocFile = useCallback(() => {
    return (fileName.toLowerCase().endsWith('.doc') && !fileName.toLowerCase().endsWith('.docx')) ||
           (mimeType === 'application/msword')
  }, [mimeType, fileName])

  const isPptFile = useCallback(() => {
    return fileName.toLowerCase().endsWith('.pptx') ||
      mimeType.includes('openxmlformats-officedocument.presentationml')
  }, [mimeType, fileName])

  const isOldPptFile = useCallback(() => {
    return fileName.toLowerCase().endsWith('.ppt') && !fileName.toLowerCase().endsWith('.pptx')
  }, [fileName])

  useEffect(() => {
    setLoading(true)
    setError(null)

    if (isExcelFile()) {
      loadExcelFile()
    } else if (isWordFile()) {
      loadWordDocument()
    } else if (isPptFile()) {
      loadPptFile()
    } else if (isOldPptFile()) {
      setError('古い形式のPowerPoint(.ppt)はサポートされていません。.pptx形式で保存し直してください。')
      setLoading(false)
    } else if (isOldDocFile()) {
      setError('古い形式のWordファイル(.doc)はサポートされていません。.docx形式で保存し直してください。')
      setLoading(false)
    } else if (mimeType.includes('text')) {
      loadTextFile()
    } else {
      setLoading(false)
    }
  }, [url, mimeType, isExcelFile, isWordFile, isOldDocFile, isPptFile, isOldPptFile])

  const loadPptFile = async () => {
    try {
      const response = await fetch(url)
      const arrayBuffer = await response.arrayBuffer()
      const zip = await JSZip.loadAsync(arrayBuffer)
      const slideFiles = Object.keys(zip.files)
        .filter((name) => name.startsWith('ppt/slides/slide') && name.endsWith('.xml'))
        .sort()

      const parser = new DOMParser()
      const slides: string[] = []

      for (const file of slideFiles) {
        const xml = await zip.file(file)?.async('string')
        if (!xml) continue
        const doc = parser.parseFromString(xml, 'application/xml')
        const nodes = Array.from(doc.getElementsByTagName('a:t'))
        const slideText = nodes.map((node) => node.textContent || '').join(' ').trim()
        slides.push(slideText)
      }

      setPptSlides(slides)
      setEditedPptSlides(slides)
      setLoading(false)
    } catch (err) {
      console.error('PPTX load error:', err)
      setError('PPTXファイルの読み込みに失敗しました')
      setLoading(false)
    }
  }

  const loadExcelFile = async () => {
    try {
      const XLSX = await import('xlsx')
      const response = await fetch(url)
      const arrayBuffer = await response.arrayBuffer()
      const workbook = XLSX.read(arrayBuffer, { type: 'array' })

      const sheets = workbook.SheetNames
      const data: { [sheet: string]: string[][] } = {}

      sheets.forEach(sheetName => {
        const worksheet = workbook.Sheets[sheetName]
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as string[][]
        data[sheetName] = jsonData
      })

      setExcelData({ sheets, data })
      setEditedExcelData(JSON.parse(JSON.stringify(data)))
      setCurrentSheet(sheets[0] || '')
      setLoading(false)
    } catch (err) {
      console.error('Excel load error:', err)
      setError('Excelファイルの読み込みに失敗しました')
      setLoading(false)
    }
  }

  const loadWordDocument = async () => {
    try {
      const mammoth = await import('mammoth')
      const response = await fetch(url)
      const arrayBuffer = await response.arrayBuffer()
      const result = await mammoth.convertToHtml({ arrayBuffer })
      setWordContent(result.value)
      setEditedContent(htmlToPlainText(result.value))
      setLoading(false)
    } catch (err: any) {
      console.error('Word load error:', err)
      if (err?.message?.includes('body element')) {
        setError('このファイルはWordドキュメント(.docx)ではありません')
      } else {
        setError('Wordファイルの読み込みに失敗しました')
      }
      setLoading(false)
    }
  }

  const loadTextFile = async () => {
    try {
      const response = await fetch(url)
      const text = await response.text()
      setTextContent(text)
      setEditedContent(text)
      setLoading(false)
    } catch (err) {
      console.error('Text load error:', err)
      setError('テキストファイルの読み込みに失敗しました')
      setLoading(false)
    }
  }

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages)
    setLoading(false)
  }

  const onDocumentLoadError = (error: Error) => {
    console.error('PDF load error:', error)
    setError('PDFの読み込みに失敗しました')
    setLoading(false)
  }

  const toggleEdit = () => {
    setIsEditing(!isEditing)
  }

  const handleCellChange = (rowIndex: number, colIndex: number, value: string) => {
    if (!currentSheet) return
    const newData = { ...editedExcelData }
    if (!newData[currentSheet]) {
      newData[currentSheet] = []
    }
    if (!newData[currentSheet][rowIndex]) {
      newData[currentSheet][rowIndex] = []
    }
    newData[currentSheet][rowIndex][colIndex] = value
    setEditedExcelData(newData)
  }

  const addRow = () => {
    if (!currentSheet) return
    const newData = { ...editedExcelData }
    const currentData = newData[currentSheet] || []
    const colCount = currentData[0]?.length || 5
    newData[currentSheet] = [...currentData, Array(colCount).fill('')]
    setEditedExcelData(newData)
  }

  const addColumn = () => {
    if (!currentSheet) return
    const newData = { ...editedExcelData }
    newData[currentSheet] = (newData[currentSheet] || []).map(row => [...row, ''])
    setEditedExcelData(newData)
  }


  const uploadBlob = async (blob: Blob, contentType: string) => {
    setSaving(true)
    const { error: uploadError } = await supabase.storage
      .from('files')
      .upload(filePath, blob, { upsert: true, contentType })

    if (uploadError) {
      console.error('Save error:', uploadError)
      setSaving(false)
      return false
    }

    await supabase.from('files').update({
      size: blob.size,
      mime_type: contentType,
      updated_at: new Date().toISOString(),
    }).eq('id', fileId)

    setSaving(false)
    return true
  }

  const saveText = async () => {
    const blob = new Blob([editedContent], { type: mimeType || 'text/plain' })
    const ok = await uploadBlob(blob, mimeType || 'text/plain')
    if (ok) {
      await upsertSearchDocument({
        sourceType: 'file',
        sourceId: fileId,
        title: fileName,
        content: editedContent || fileName,
        metadata: { fileName, mimeType },
      })
      onSaved?.()
    }
  }

  const saveWord = async () => {
    const plain = editedContent
    const paragraphs = plain.split(/\n+/).map((line) => new Paragraph(line))
    const doc = new DocxDocument({
      sections: [{ children: paragraphs.length ? paragraphs : [new Paragraph('')] }],
    })
    const blob = await Packer.toBlob(doc)
    const ok = await uploadBlob(blob, mimeType || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    if (ok) {
      await upsertSearchDocument({
        sourceType: 'file',
        sourceId: fileId,
        title: fileName,
          content: plain || fileName,
          metadata: { fileName, mimeType },
        })
      onSaved?.()
    }
  }

  const saveExcel = async () => {
    try {
      const XLSX = await import('xlsx')
      const workbook = XLSX.utils.book_new()
      Object.keys(editedExcelData).forEach(sheetName => {
        const worksheet = XLSX.utils.aoa_to_sheet(editedExcelData[sheetName])
        XLSX.utils.book_append_sheet(workbook, worksheet, sheetName)
      })
      const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })
      const blob = new Blob([excelBuffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      })
      const ok = await uploadBlob(blob, mimeType || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      if (ok) {
        const excelText = Object.values(editedExcelData)
          .map((rows) => rows.map((row) => row.join('\t')).join('\n'))
          .join('\n')
        await upsertSearchDocument({
          sourceType: 'file',
          sourceId: fileId,
          title: fileName,
          content: excelText || fileName,
          metadata: { fileName, mimeType },
        })
        onSaved?.()
      }
    } catch (err) {
      console.error('Excel save error:', err)
    }
  }

  const savePptx = async () => {
    try {
      const pptx = new PptxGenJS()
      editedPptSlides.forEach((text, index) => {
        const slide = pptx.addSlide()
        const content = text || `Slide ${index + 1}`
        slide.addText(content, { x: 0.5, y: 0.5, w: 9, h: 5, fontSize: 20 })
      })
      const blob = await pptx.write('blob')
      const ok = await uploadBlob(
        blob as Blob,
        mimeType || 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
      )
      if (ok) {
        await upsertSearchDocument({
          sourceType: 'file',
          sourceId: fileId,
          title: fileName,
          content: editedPptSlides.join('\n') || fileName,
          metadata: { fileName, mimeType },
        })
        onSaved?.()
      }
    } catch (err) {
      console.error('PPTX save error:', err)
    }
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="font-pixel loading-text">読み込み中</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-500 font-pixel mb-2">* エラー</p>
          <p className="text-sm text-gray-600">{error}</p>
        </div>
      </div>
    )
  }

  // 画像プレビュー
  if (mimeType.startsWith('image/')) {
    return (
      <div className="h-full flex items-center justify-center p-4 bg-gray-100">
        <img
          src={url}
          alt={fileName}
          className="max-w-full max-h-full object-contain"
          style={{ imageRendering: 'auto' }}
        />
      </div>
    )
  }

  // PDFプレビュー
  if (mimeType.includes('pdf')) {
    return (
      <div className="h-full flex flex-col">
        <div className="p-2 border-b border-gray-200 flex items-center justify-between bg-gray-50">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPageNumber(Math.max(1, pageNumber - 1))}
              disabled={pageNumber <= 1}
              className="px-2 py-1 border border-black disabled:opacity-50"
            >
              ←
            </button>
            <span className="text-sm">
              {pageNumber} / {numPages}
            </span>
            <button
              onClick={() => setPageNumber(Math.min(numPages, pageNumber + 1))}
              disabled={pageNumber >= numPages}
              className="px-2 py-1 border border-black disabled:opacity-50"
            >
              →
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setScale(Math.max(0.5, scale - 0.25))}
              className="px-2 py-1 border border-black"
            >
              −
            </button>
            <span className="text-sm">{Math.round(scale * 100)}%</span>
            <button
              onClick={() => setScale(Math.min(2, scale + 0.25))}
              className="px-2 py-1 border border-black"
            >
              +
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-4 bg-gray-200 flex justify-center">
          <PdfDocument
            file={url}
            onLoadSuccess={onDocumentLoadSuccess}
            onLoadError={onDocumentLoadError}
            loading={
              <div className="flex items-center justify-center h-64">
                <p className="font-pixel loading-text">PDF読み込み中</p>
              </div>
            }
          >
            <PdfPage
              pageNumber={pageNumber}
              scale={scale}
              renderTextLayer={false}
              renderAnnotationLayer={false}
            />
          </PdfDocument>
        </div>
      </div>
    )
  }

  // Excelプレビュー
  if (isExcelFile() && excelData) {
    const sheetData = isEditing ? editedExcelData[currentSheet] : excelData.data[currentSheet]
    const maxCols = Math.max(...(sheetData || []).map(row => row?.length || 0), 5)

    return (
      <div className="h-full flex flex-col">
        {/* コントロール */}
        <div className="p-2 border-b border-gray-200 flex items-center justify-between bg-gray-50">
          <div className="flex items-center gap-2">
            <span className="text-sm font-pixel">Excel</span>
            <select
              value={currentSheet}
              onChange={(e) => setCurrentSheet(e.target.value)}
              className="px-2 py-1 border border-black text-sm"
            >
              {excelData.sheets.map(sheet => (
                <option key={sheet} value={sheet}>{sheet}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={toggleEdit}
              className={`px-3 py-1 text-sm border border-black ${
                isEditing ? 'bg-black text-white' : ''
              }`}
            >
              {isEditing ? '✓ 編集中' : '✎ 編集'}
            </button>
            {isEditing && (
              <>
                <button
                  onClick={addRow}
                  className="px-2 py-1 text-sm border border-black"
                  title="行を追加"
                >
                  +行
                </button>
                <button
                  onClick={addColumn}
                  className="px-2 py-1 text-sm border border-black"
                  title="列を追加"
                >
                  +列
                </button>
                <button
                  onClick={saveExcel}
                  className="px-3 py-1 text-sm border border-black bg-green-100"
                  disabled={saving}
                >
                  {saving ? '保存中...' : '保存'}
                </button>
              </>
            )}
          </div>
        </div>

        {/* スプレッドシート */}
        <div className="flex-1 overflow-auto">
          <table className="border-collapse w-full">
            <thead>
              <tr className="bg-gray-100 sticky top-0">
                <th className="border border-gray-300 px-1 py-1 text-xs text-gray-500 w-8">#</th>
                {Array.from({ length: maxCols }, (_, i) => (
                  <th key={i} className="border border-gray-300 px-2 py-1 text-xs text-gray-500 min-w-[80px]">
                    {String.fromCharCode(65 + i)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(sheetData || []).map((row, rowIndex) => (
                <tr key={rowIndex}>
                  <td className="border border-gray-300 px-1 py-1 text-xs text-gray-500 text-center bg-gray-50">
                    {rowIndex + 1}
                  </td>
                  {Array.from({ length: maxCols }, (_, colIndex) => (
                    <td key={colIndex} className="border border-gray-300 p-0">
                      {isEditing ? (
                        <input
                          type="text"
                          value={row?.[colIndex] ?? ''}
                          onChange={(e) => handleCellChange(rowIndex, colIndex, e.target.value)}
                          className="w-full px-1 py-1 text-sm border-0 focus:outline-none focus:bg-yellow-50"
                        />
                      ) : (
                        <span className="block px-1 py-1 text-sm">
                          {row?.[colIndex] ?? ''}
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
              {(!sheetData || sheetData.length === 0) && (
                <tr>
                  <td colSpan={maxCols + 1} className="border border-gray-300 px-4 py-8 text-center text-gray-400">
                    データがありません
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  // Wordドキュメントプレビュー
  if (isWordFile()) {
    return (
      <div className="h-full flex flex-col">
        <div className="p-2 border-b border-gray-200 flex items-center justify-between bg-gray-50">
          <span className="text-sm font-pixel">Wordドキュメント</span>
          <div className="flex items-center gap-2">
            <button
              onClick={toggleEdit}
              className={`px-3 py-1 text-sm border border-black ${
                isEditing ? 'bg-black text-white' : ''
              }`}
            >
              {isEditing ? '✓ 編集中' : '✎ 編集'}
            </button>
            {isEditing && (
              <button
                onClick={saveWord}
                className="px-3 py-1 text-sm border border-black bg-green-100"
                disabled={saving}
              >
                {saving ? '保存中...' : '保存'}
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-auto p-4 bg-white">
          {isEditing ? (
            <textarea
              value={editedContent}
              onChange={(e) => setEditedContent(e.target.value)}
              className="w-full h-full p-4 border border-gray-300 resize-none font-sans"
              style={{ minHeight: '400px' }}
            />
          ) : (
            <div
              className="prose max-w-none"
              dangerouslySetInnerHTML={{ __html: wordContent }}
            />
          )}
        </div>
      </div>
    )
  }

  // テキストファイルプレビュー
  if (mimeType.includes('text')) {
    return (
      <div className="h-full flex flex-col">
        <div className="p-2 border-b border-gray-200 flex items-center justify-between bg-gray-50">
          <span className="text-sm font-pixel">テキストファイル</span>
          <div className="flex items-center gap-2">
            <button
              onClick={toggleEdit}
              className={`px-3 py-1 text-sm border border-black ${
                isEditing ? 'bg-black text-white' : ''
              }`}
            >
              {isEditing ? '✓ 編集中' : '✎ 編集'}
            </button>
            {isEditing && (
              <button
                onClick={saveText}
                className="px-3 py-1 text-sm border border-black bg-green-100"
                disabled={saving}
              >
                {saving ? '保存中...' : '保存'}
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          <textarea
            value={isEditing ? editedContent : textContent}
            onChange={(e) => setEditedContent(e.target.value)}
            readOnly={!isEditing}
            className={`w-full h-full p-4 font-mono text-sm resize-none ${
              isEditing ? 'bg-white' : 'bg-gray-50'
            }`}
            style={{ minHeight: '400px' }}
          />
        </div>
      </div>
    )
  }

  // PPTXプレビュー/編集
  if (isPptFile()) {
    return (
      <div className="h-full flex flex-col">
        <div className="p-2 border-b border-gray-200 flex items-center justify-between bg-gray-50">
          <span className="text-sm font-pixel">PowerPoint</span>
          <div className="flex items-center gap-2">
            <button
              onClick={toggleEdit}
              className={`px-3 py-1 text-sm border border-black ${
                isEditing ? 'bg-black text-white' : ''
              }`}
            >
              {isEditing ? '✓ 編集中' : '✎ 編集'}
            </button>
            {isEditing && (
              <button
                onClick={savePptx}
                className="px-3 py-1 text-sm border border-black bg-green-100"
                disabled={saving}
              >
                {saving ? '保存中...' : '保存'}
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-auto p-4 bg-white space-y-4">
          {isEditing ? (
            <>
              {editedPptSlides.map((slide, index) => (
                <div key={index} className="border-2 border-black p-3">
                  <div className="text-xs text-gray-500 mb-2">Slide {index + 1}</div>
                  <textarea
                    value={slide}
                    onChange={(e) => {
                      const next = [...editedPptSlides]
                      next[index] = e.target.value
                      setEditedPptSlides(next)
                    }}
                    className="w-full h-24 border border-gray-300 p-2"
                  />
                </div>
              ))}
              <button
                onClick={() => setEditedPptSlides([...editedPptSlides, ''])}
                className="pixel-btn"
              >
                + スライド追加
              </button>
            </>
          ) : (
            <iframe
              title="PowerPoint preview"
              src={`https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`}
              className="w-full h-[500px] border-2 border-black"
            />
          )}
        </div>
      </div>
    )
  }

  // その他のファイル
  return (
    <div className="h-full flex items-center justify-center">
      <div className="text-center">
        <p className="text-4xl mb-4">📎</p>
        <p className="font-pixel">プレビューできません</p>
        <p className="text-sm text-gray-500 mt-2">
          ダウンロードして確認してください
        </p>
      </div>
    </div>
  )
}
