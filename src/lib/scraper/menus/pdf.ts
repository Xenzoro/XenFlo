/**
 * PDF text with unpdf (a serverless build of Mozilla's pdf.js: pure JavaScript, no native
 * binaries, so it runs in Vercel's Node functions). Text only: picture-only PDFs come back
 * empty and are left for the AI menu reader (src/lib/ai/menus.ts).
 */
import { extractText, getDocumentProxy } from "unpdf";

export interface PdfText {
  /** Pages in the whole file */
  pages: number;
  /** Text of the first `maxPages` pages, one string per page */
  text: string[];
}

/** True when the bytes start like a PDF ("%PDF-"), so an HTML error page isn't parsed as one. */
export function isPdf(bytes: Uint8Array): boolean {
  return bytes.length > 5 && String.fromCharCode(...bytes.slice(0, 5)) === "%PDF-";
}

export async function readPdfText(bytes: Uint8Array, maxPages: number): Promise<PdfText> {
  // pdf.js takes ownership of the buffer it's given, so pass a copy and keep ours usable.
  const pdf = await getDocumentProxy(bytes.slice());
  try {
    const { totalPages, text } = await extractText(pdf, { mergePages: false });
    return { pages: totalPages, text: text.slice(0, maxPages) };
  } finally {
    await pdf.destroy();
  }
}
