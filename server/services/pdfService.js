import { GoogleGenerativeAI } from '@google/generative-ai';

const DEFAULT_API_KEY = process.env.GEMINI_API_KEY || '';

/**
 * High-fidelity legal text extraction from PDF using Gemini's native multimodal capabilities.
 */
export async function extractTextWithGemini(pdfBuffer, originalFilename = 'document.pdf') {
  try {
    const genAI = new GoogleGenerativeAI(DEFAULT_API_KEY);
    const model = genAI.getGenerativeModel({
      model: process.env.GEMINI_MODEL || 'gemini-flash-lite-latest',
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 8192,
      },
    });

    const base64Data = pdfBuffer.toString('base64');
    const result = await model.generateContent([
      {
        inlineData: {
          data: base64Data,
          mimeType: 'application/pdf',
        },
      },
      `Extract the complete, verbatim text, all clauses, sections, party names, terms, and obligations from this legal document ("${originalFilename}").
Preserve the section headings, clause numbers, and exact wording. Do NOT output raw PDF byte objects or formatting metadata.`,
    ]);

    const extractedText = result.response.text();
    return extractedText ? extractedText.trim() : '';
  } catch (error) {
    console.error('[Gemini Multimodal PDF Error]:', error.message);
    return '';
  }
}

/**
 * Checks if a string contains raw PDF binary or PostScript stream tokens.
 */
function isRawPdfBinary(text) {
  if (!text) return true;
  const rawTokens = ['%PDF-', 'obj', 'endobj', 'stream', 'endstream', 'xref', 'trailer', 'FlateDecode'];
  let hitCount = 0;
  for (const token of rawTokens) {
    if (text.includes(token)) hitCount += 1;
  }
  return hitCount >= 2 || text.length < 30;
}

/**
 * Extracts clean plain text and page metadata from a PDF Buffer.
 */
export async function extractTextFromPDF(pdfBuffer, originalFilename = 'document.pdf') {
  let text = '';
  let pageCount = 1;

  // Primary: Use Gemini native multimodal PDF intelligence
  text = await extractTextWithGemini(pdfBuffer, originalFilename);

  // Fallback if Gemini extraction is empty: basic text cleaner
  if (!text || isRawPdfBinary(text)) {
    const rawString = pdfBuffer.toString('utf8');
    const cleanMatches = rawString.match(/[A-Z][a-zA-Z0-9\s.,;:'"()\-–—]{15,}/g);
    text = cleanMatches ? cleanMatches.filter(m => !isRawPdfBinary(m)).join('\n\n') : 'Document text extracted.';
  }

  // Estimate page count
  pageCount = Math.max(1, Math.ceil(text.length / 2200));

  return {
    text: text.trim(),
    pageCount,
  };
}

/**
 * Splits document text into overlapping legal chunks with paragraph and sentence awareness.
 */
export function chunkLegalText(fullText, chunkSize = 1200, chunkOverlap = 200) {
  if (!fullText || fullText.trim().length === 0) return [];

  const chunks = [];
  const paragraphs = fullText.split(/\n\s*\n/);
  let currentChunk = '';
  let chunkIndex = 0;

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed || isRawPdfBinary(trimmed)) continue;

    if (currentChunk.length + trimmed.length + 2 <= chunkSize) {
      currentChunk += (currentChunk ? '\n\n' : '') + trimmed;
    } else {
      if (currentChunk) {
        chunks.push({
          chunk_index: chunkIndex++,
          text: currentChunk,
          token_count: Math.ceil(currentChunk.length / 4),
          page_number: Math.max(1, Math.ceil((chunkIndex * chunkSize) / 2500)),
        });
        const overlapText = currentChunk.slice(-chunkOverlap);
        currentChunk = overlapText + '\n\n' + trimmed;
      } else {
        let start = 0;
        while (start < trimmed.length) {
          const slice = trimmed.slice(start, start + chunkSize);
          chunks.push({
            chunk_index: chunkIndex++,
            text: slice,
            token_count: Math.ceil(slice.length / 4),
            page_number: Math.max(1, Math.ceil((chunkIndex * chunkSize) / 2500)),
          });
          start += chunkSize - chunkOverlap;
        }
        currentChunk = '';
      }
    }
  }

  if (currentChunk.trim()) {
    chunks.push({
      chunk_index: chunkIndex++,
      text: currentChunk.trim(),
      token_count: Math.ceil(currentChunk.length / 4),
      page_number: Math.max(1, Math.ceil((chunkIndex * chunkSize) / 2500)),
    });
  }

  return chunks;
}
