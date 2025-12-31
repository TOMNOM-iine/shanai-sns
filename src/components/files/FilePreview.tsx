'use client'

import { useState, useEffect, useCallback } from 'react'
import dynamic from 'next/dynamic'

// react-pdfを動的インポート（SSR無効）
const Document = dynamic(
  () => import('react-pdf').then((mod) => mod.Document),
  { ssr: false }
)
const Page = dynamic(
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
}

interface ExcelData {
  sheets: string[]
  data: { [sheet: string]: string[][] }
}

export default function FilePreview({ url, fileName, mimeType }: FilePreviewProps) {
  const [numPages, setNumPages] = useState<number>(0)
  const [pageNumber, setPageNumber] = useState(1)
  const [wordContent, setWordContent] = useState<string>('')
  const [textContent, setTextContent] = useState<string>('')
  const [excelData, setExcelData] = useState<ExcelData | null>(null)
  const [currentSheet, setCurrentSheet] = useState<string>('')
  const [editedExcelData, setEditedExcelData] = useState<{ [sheet: string]: string[][] }>({})
  const [isEditing, setIsEditing] = useState(false)
  const [editedContent, setEditedContent] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [scale, setScale] = useState(1.0)

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

  useEffect(() => {
    setLoading(true)
    setError(null)

    if (isExcelFile()) {
      loadExcelFile()
    } else if (isWordFile()) {
      loadWordDocument()
    } else if (isOldDocFile()) {
      setError('古い形式のWordファイル(.doc)はサポートされていません。.docx形式で保存し直してください。')
      setLoading(false)
    } else if (mimeType.includes('text')) {
      loadTextFile()
    } else {
      setLoading(false)
    }
  }, [url, mimeType, isExcelFile, isWordFile, isOldDocFile])

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
      setEditedContent(result.value)
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

  const downloadExcel = async () => {
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
      const downloadUrl = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = downloadUrl
      link.download = fileName.replace(/\.[^.]+$/, '') + '_edited.xlsx'
      link.click()
      URL.revokeObjectURL(downloadUrl)
    } catch (err) {
      console.error('Excel download error:', err)
    }
  }

  const downloadEdited = () => {
    const blob = new Blob([editedContent], { type: 'text/plain' })
    const downloadUrl = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = downloadUrl
    link.download = fileName.replace(/\.[^.]+$/, '') + '_edited.txt'
    link.click()
    URL.revokeObjectURL(downloadUrl)
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
          <Document
            file={url}
            onLoadSuccess={onDocumentLoadSuccess}
            onLoadError={onDocumentLoadError}
            loading={
              <div className="flex items-center justify-center h-64">
                <p className="font-pixel loading-text">PDF読み込み中</p>
              </div>
            }
          >
            <Page
              pageNumber={pageNumber}
              scale={scale}
              renderTextLayer={false}
              renderAnnotationLayer={false}
            />
          </Document>
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
                  onClick={downloadExcel}
                  className="px-3 py-1 text-sm border border-black bg-green-100"
                >
                  ↓ 保存
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
                onClick={downloadEdited}
                className="px-3 py-1 text-sm border border-black bg-green-100"
              >
                ↓ 保存
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
                onClick={downloadEdited}
                className="px-3 py-1 text-sm border border-black bg-green-100"
              >
                ↓ 保存
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
