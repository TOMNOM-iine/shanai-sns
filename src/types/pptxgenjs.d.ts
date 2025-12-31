declare module 'pptxgenjs' {
  interface Slide {
    addText(text: string, options?: Record<string, unknown>): void
  }

  export default class PptxGenJS {
    addSlide(): Slide
    write(type: 'blob'): Promise<Blob>
  }
}
