import express from 'express';
import { Document } from '../models/Document.js';
import { Chunk } from '../models/Chunk.js';
import { Analysis } from '../models/Analysis.js';
import { requireAuth } from '../middleware/auth.js';
import { analyzeContractText, draftClauseWithAI } from '../services/geminiService.js';

const router = express.Router();

/**
 * POST /analysis/draft-clause
 * Interactive AI clause generator for custom legal provisions
 */
router.post('/analysis/draft-clause', requireAuth, async (req, res) => {
  try {
    const { clauseType, context, jurisdiction, favorParty, strictness } = req.body;
    if (!clauseType) {
      return res.status(400).json({
        error_code: 'missing_clause_type',
        message: 'Clause type is required.',
      });
    }

    const drafted = await draftClauseWithAI({
      clauseType,
      context,
      jurisdiction,
      favorParty,
      strictness,
    });

    return res.json(drafted);
  } catch (error) {
    console.error('[Clause Drafter Error]:', error);
    return res.status(500).json({
      error_code: 'drafting_failed',
      message: error.message || 'Failed to draft legal clause.',
    });
  }
});

/**
 * POST /analysis/:documentId
 */
router.post('/analysis/:documentId', requireAuth, async (req, res) => {
  try {
    const { documentId } = req.params;

    const doc = await Document.findOne({
      _id: documentId,
      $or: [{ user_id: req.user._id }, { user_id: null }],
    });

    if (!doc) {
      return res.status(404).json({
        error_code: 'document_not_found',
        message: 'Document not found.',
      });
    }

    // Check if an analysis already exists
    let existingAnalysis = await Analysis.findOne({ document_id: doc._id });
    if (existingAnalysis) {
      return res.json(existingAnalysis.toJSON());
    }

    // Retrieve full document text from chunks
    const chunks = await Chunk.find({ document_id: doc._id }).sort({ chunk_index: 1 });
    const fullText = chunks.map((c) => c.text).join('\n\n') || doc.preview_text || '';

    if (!fullText) {
      return res.status(400).json({
        error_code: 'empty_document',
        message: 'No readable text available to analyze this document.',
      });
    }

    const aiResult = await analyzeContractText(doc.original_filename, fullText);

    const analysis = await Analysis.create({
      document_id: doc._id,
      user_id: req.user._id,
      executive_summary: aiResult.executive_summary,
      overall_risk_score: aiResult.overall_risk_score ?? 25,
      overall_risk_level: aiResult.overall_risk_level ?? 'low',
      key_clauses: aiResult.key_clauses || [],
      compliance_items: aiResult.compliance_items || [],
      action_items: aiResult.action_items || [],
    });

    // Update document risk level
    doc.risk_level = analysis.overall_risk_level;
    await doc.save();

    return res.json(analysis.toJSON());
  } catch (error) {
    console.error('[Analysis Error]:', error);
    return res.status(500).json({
      error_code: 'analysis_failed',
      message: error.message || 'Failed to analyze legal contract.',
    });
  }
});

/**
 * GET /analysis/:documentId
 */
router.get('/analysis/:documentId', requireAuth, async (req, res) => {
  try {
    const analysis = await Analysis.findOne({ document_id: req.params.documentId });
    if (!analysis) {
      return res.status(404).json({
        error_code: 'analysis_not_found',
        message: 'No analysis found for this document.',
      });
    }
    return res.json(analysis.toJSON());
  } catch (error) {
    return res.status(500).json({
      error_code: 'internal_error',
      message: 'Failed to retrieve analysis.',
    });
  }
});

export default router;
