import express from 'express';
import multer from 'multer';
import crypto from 'crypto';
import { Document } from '../models/Document.js';
import { Chunk } from '../models/Chunk.js';
import { requireAuth } from '../middleware/auth.js';
import { extractTextFromPDF, chunkLegalText } from '../services/pdfService.js';
import { generateWithFallback } from '../services/geminiService.js';

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024 }, // 30MB
});

/**
 * Helper to process document in background with text extraction & Gemini summary
 */
async function processDocumentAsync(docId, buffer, originalFilename, userId) {
  try {
    await Document.findByIdAndUpdate(docId, { status: 'processing' });

    const { text, pageCount } = await extractTextFromPDF(buffer);
    if (!text || text.trim().length === 0) {
      throw new Error('No readable text could be extracted from this PDF document.');
    }

    const chunks = chunkLegalText(text);
    const chunkDocs = chunks.map((c) => ({
      document_id: docId,
      user_id: userId,
      chunk_index: c.chunk_index,
      text: c.text,
      token_count: c.token_count,
      page_number: c.page_number,
    }));

    if (chunkDocs.length > 0) {
      await Chunk.insertMany(chunkDocs);
    }

    // Generate quick summary and preview text via Gemini
    let summaryText = text.slice(0, 300) + '...';
    try {
      const summaryPrompt = `Provide a concise 2-sentence executive summary for this legal document titled "${originalFilename}":\n\n"""${text.slice(0, 4000)}"""`;
      const { text: geminiSummary } = await generateWithFallback(summaryPrompt, 'You are a legal summarizer AI.');
      if (geminiSummary) summaryText = geminiSummary.trim();
    } catch (sErr) {
      console.warn('[Summary Generation Warning]:', sErr.message);
    }

    await Document.findByIdAndUpdate(docId, {
      page_count: pageCount,
      chunk_count: chunkDocs.length,
      status: 'ready',
      preview_text: text.slice(0, 500),
      summary: summaryText,
    });
    console.log(`[Document Processor] Document ${docId} (${originalFilename}) processed successfully (${chunkDocs.length} chunks).`);
  } catch (error) {
    console.error(`[Document Processor Error] Document ${docId}:`, error);
    await Document.findByIdAndUpdate(docId, {
      status: 'failed',
      error_message: error.message || 'Processing failed.',
    });
  }
}

/**
 * POST /upload (or /api/upload)
 */
router.post('/upload', requireAuth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        error_code: 'no_file_uploaded',
        message: 'Please provide a PDF file to upload.',
      });
    }

    if (req.file.mimetype !== 'application/pdf' && !req.file.originalname.toLowerCase().endsWith('.pdf')) {
      return res.status(400).json({
        error_code: 'invalid_file_type',
        message: 'Only PDF documents are supported.',
      });
    }

    const storedFilename = `${crypto.randomUUID()}.pdf`;
    const doc = await Document.create({
      user_id: req.user._id,
      original_filename: req.file.originalname,
      filename: storedFilename,
      content_type: 'application/pdf',
      size_bytes: req.file.size,
      status: 'uploaded',
    });

    // Fire off async background extraction & chunking
    processDocumentAsync(doc._id, req.file.buffer, req.file.originalname, req.user._id);

    return res.status(201).json({
      document: doc.toJSON(),
      message: 'Document uploaded and is being processed.',
    });
  } catch (error) {
    console.error('[Upload Error]:', error);
    return res.status(500).json({
      error_code: 'upload_failed',
      message: 'Failed to upload document.',
    });
  }
});

/**
 * GET /documents
 */
router.get('/documents', requireAuth, async (req, res) => {
  try {
    const docs = await Document.find({
      $or: [{ user_id: req.user._id }, { user_id: null }],
    }).sort({ created_at: -1 });

    return res.json({
      documents: docs.map((d) => d.toJSON()),
      total: docs.length,
    });
  } catch (error) {
    console.error('[List Documents Error]:', error);
    return res.status(500).json({
      error_code: 'internal_error',
      message: 'Failed to retrieve documents.',
    });
  }
});

/**
 * GET /documents/:id
 */
router.get('/documents/:id', requireAuth, async (req, res) => {
  try {
    const doc = await Document.findOne({
      _id: req.params.id,
      $or: [{ user_id: req.user._id }, { user_id: null }],
    });

    if (!doc) {
      return res.status(404).json({
        error_code: 'document_not_found',
        message: 'Document not found.',
      });
    }
    return res.json(doc.toJSON());
  } catch (error) {
    return res.status(404).json({
      error_code: 'document_not_found',
      message: 'Document not found.',
    });
  }
});

/**
 * GET /documents/:id/status
 */
router.get('/documents/:id/status', requireAuth, async (req, res) => {
  try {
    const doc = await Document.findById(req.params.id);
    if (!doc) {
      return res.status(404).json({
        error_code: 'document_not_found',
        message: 'Document not found.',
      });
    }
    return res.json({
      id: doc._id.toString(),
      status: doc.status,
      chunk_count: doc.chunk_count,
      error_message: doc.error_message,
    });
  } catch (error) {
    return res.status(404).json({
      error_code: 'document_not_found',
      message: 'Document not found.',
    });
  }
});

/**
 * DELETE /documents/:id
 */
router.delete('/documents/:id', requireAuth, async (req, res) => {
  try {
    const doc = await Document.findOneAndDelete({
      _id: req.params.id,
      user_id: req.user._id,
    });

    if (!doc) {
      return res.status(404).json({
        error_code: 'document_not_found',
        message: 'Document not found or permission denied.',
      });
    }

    await Chunk.deleteMany({ document_id: doc._id });
    return res.status(204).send();
  } catch (error) {
    console.error('[Delete Document Error]:', error);
    return res.status(500).json({
      error_code: 'delete_failed',
      message: 'Failed to delete document.',
    });
  }
});

export default router;
