'use client'

import JSZip from 'jszip'
import * as XLSX from 'xlsx'
import mammoth from 'mammoth'

function normalizeText(input: string) {
  return input.replace(/\s+/g, ' ').trim()
}

async function extractPptxText(arrayBuffer: ArrayBuffer) {
  const zip = await JSZip.loadAsync(arrayBuffer)
  const slideFiles = Object.keys(zip.files)
    .filter((name) => name.startsWith('ppt/slides/slide') && name.endsWith('.xml'))
    .sort()

  const parser = new DOMParser()
  const texts: string[] = []

  for (const fileName of slideFiles) {
    const xml = await zip.file(fileName)?.async('string')
    if (!xml) continue
    const doc = parser.parseFromString(xml, 'application/xml')
    const nodes = Array.from(doc.getElementsByTagName('a:t'))
    const slideText = nodes.map((node) => node.textContent || '').join(' ')
    if (slideText.trim()) {
      texts.push(slideText.trim())
    }
  }

  return texts.join('\n')
}

export async function extractTextFromFile(file: File): Promise<string> {
  const fileName = file.name.toLowerCase()
  const mimeType = file.type || ''

  if (mimeType.startsWith('text/') || fileName.endsWith('.txt') || fileName.endsWith('.md')) {
    return normalizeText(await file.text())
  }

  if (mimeType.includes('csv') || fileName.endsWith('.csv')) {
    return normalizeText(await file.text())
  }

  if (
    mimeType.includes('spreadsheet') ||
    mimeType.includes('excel') ||
    fileName.endsWith('.xlsx') ||
    fileName.endsWith('.xls')
  ) {
    const arrayBuffer = await file.arrayBuffer()
    const workbook = XLSX.read(arrayBuffer, { type: 'array' })
    const texts: string[] = []
    workbook.SheetNames.forEach((sheetName) => {
      const worksheet = workbook.Sheets[sheetName]
      const csv = XLSX.utils.sheet_to_csv(worksheet)
      if (csv.trim()) {
        texts.push(csv)
      }
    })
    return normalizeText(texts.join('\n'))
  }

  if (
    mimeType.includes('openxmlformats-officedocument.wordprocessingml') ||
    fileName.endsWith('.docx')
  ) {
    const arrayBuffer = await file.arrayBuffer()
    const result = await mammoth.extractRawText({ arrayBuffer })
    return normalizeText(result.value)
  }

  if (
    mimeType.includes('openxmlformats-officedocument.presentationml') ||
    fileName.endsWith('.pptx')
  ) {
    const arrayBuffer = await file.arrayBuffer()
    return normalizeText(await extractPptxText(arrayBuffer))
  }

  return ''
}
