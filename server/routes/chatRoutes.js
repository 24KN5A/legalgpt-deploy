import express from 'express';
import { Conversation } from '../models/Conversation.js';
import { Message } from '../models/Message.js';
import { Chunk } from '../models/Chunk.js';
import { Document } from '../models/Document.js';
import { requireAuth } from '../middleware/auth.js';
import {
  generateWithFallback,
  streamGenerateWithFallback,
  calculateRelevance,
} from '../services/geminiService.js';

const router = express.Router();

/**
 * Retrieves relevant chunks for a user query and returns grounded sources.
 */
async function retrieveContextChunks(query, documentId, documentIds, userId) {
  let chunkQuery = {};
  if (documentId) {
    chunkQuery.document_id = documentId;
  } else if (documentIds && documentIds.length > 0) {
    chunkQuery.document_id = { $in: documentIds };
  } else {
    // Search across all accessible documents
    const accessibleDocs = await Document.find({
      $or: [{ user_id: userId }, { user_id: null }],
    }).select('_id');
    chunkQuery.document_id = { $in: accessibleDocs.map((d) => d._id) };
  }

  const allChunks = await Chunk.find(chunkQuery).populate('document_id', 'original_filename summary preview_text');
  if (allChunks.length === 0) {
    return { contextText: '', sources: [], topSimilarity: 0, confidence: 0.15, matchQuality: 'Low' };
  }

  // Score each chunk
  const scored = allChunks.map((c) => {
    const similarity = calculateRelevance(query, c.text);
    return {
      chunk: c,
      similarity,
      document_id: c.document_id?._id?.toString() || c.document_id?.toString() || '',
      filename: c.document_id?.original_filename || 'Document',
      chunk_index: c.chunk_index,
      text: c.text,
      page_number: c.page_number,
    };
  });

  scored.sort((a, b) => b.similarity - a.similarity);

  // If scoped to a specific document, include up to 8 top chunks (or all chunks if <=8)
  const topCount = documentId ? Math.min(8, allChunks.length) : 5;
  const topChunks = scored.slice(0, topCount);
  const topSimilarity = topChunks[0]?.similarity || 0.5;

  const validChunks = topChunks;

  const contextText = validChunks
    .map(
      (c, i) =>
        `[Source ${i + 1} - ${c.filename} (Page ${c.page_number})]:\n${c.text}`
    )
    .join('\n\n---\n\n');

  const confidence = Math.min(0.98, Math.max(0.70, topSimilarity));
  const matchQuality = confidence > 0.8 ? 'High' : confidence > 0.6 ? 'Medium' : 'Low';

  const sources = validChunks.slice(0, 3).map((c) => ({
    document_id: c.document_id,
    filename: c.filename,
    chunk_index: c.chunk_index,
    text: c.text,
    similarity: Number(c.similarity.toFixed(2)),
    page_number: c.page_number,
  }));

  return { contextText, sources, topSimilarity, confidence, matchQuality };
}

/**
 * Builds the strict legal assistant system prompt.
 */
function buildLegalSystemPrompt(contextText) {
  if (!contextText) {
    return `You are LegalGPT, an expert legal document assistant. 
Strict Hallucination Policy: There are NO relevant uploaded document context chunks matching this query. 
Explicitly state that the uploaded documents do not contain information to answer the question, or provide general informational legal principles while noting that no specific document context was found.`;
  }

  return `You are LegalGPT, a precise AI legal assistant.
You answer user questions strictly based on the provided retrieved context chunks below.

RULES:
1. Ground your answers ONLY in the provided document excerpts.
2. Cite the source document names and page numbers when referencing clauses or facts.
3. If the context does not contain sufficient details to answer, clearly explain what is missing.
4. Maintain a professional, objective, and structured legal tone.

RETRIEVED CONTEXT:
"""
${contextText}
"""`;
}

/**
 * POST /chat
 */
router.post('/chat', requireAuth, async (req, res) => {
  try {
    const { message, conversation_id, document_id, document_ids } = req.body;
    if (!message) {
      return res.status(400).json({
        error_code: 'validation_error',
        message: 'Message text is required.',
      });
    }

    let convo = null;
    if (conversation_id) {
      convo = await Conversation.findOne({ _id: conversation_id, user_id: req.user._id });
      if (!convo) {
        return res.status(404).json({
          error_code: 'conversation_not_found',
          message: 'Conversation not found.',
        });
      }
    } else {
      const titlePrompt = message.slice(0, 35) + (message.length > 35 ? '...' : '');
      convo = await Conversation.create({
        user_id: req.user._id,
        title: titlePrompt,
        document_id: document_id || null,
        document_ids: document_ids || (document_id ? [document_id] : []),
      });
    }

    // Save user message
    await Message.create({
      conversation_id: convo._id,
      role: 'user',
      content: message,
    });

    const { contextText, sources, topSimilarity, confidence, matchQuality } =
      await retrieveContextChunks(message, document_id || convo.document_id, document_ids || convo.document_ids, req.user._id);

    const systemPrompt = buildLegalSystemPrompt(contextText);
    const { text: answer } = await generateWithFallback(message, systemPrompt);

    const assistantMsg = await Message.create({
      conversation_id: convo._id,
      role: 'assistant',
      content: answer,
      sources,
      confidence,
      match_quality: matchQuality,
      top_similarity: topSimilarity,
    });

    return res.json({
      conversation_id: convo._id.toString(),
      message: assistantMsg.toJSON(),
    });
  } catch (error) {
    console.error('[Chat Error]:', error);
    return res.status(500).json({
      error_code: 'chat_failed',
      message: error.message || 'Failed to process chat query.',
    });
  }
});

/**
 * POST /chat/stream (NDJSON Streaming)
 */
router.post('/chat/stream', requireAuth, async (req, res) => {
  try {
    const { message, conversation_id, document_id, document_ids } = req.body;
    if (!message) {
      return res.status(400).json({
        error_code: 'validation_error',
        message: 'Message text is required.',
      });
    }

    let convo = null;
    if (conversation_id) {
      convo = await Conversation.findOne({ _id: conversation_id, user_id: req.user._id });
      if (!convo) {
        return res.status(404).json({
          error_code: 'conversation_not_found',
          message: 'Conversation not found.',
        });
      }
    } else {
      const titlePrompt = message.slice(0, 35) + (message.length > 35 ? '...' : '');
      convo = await Conversation.create({
        user_id: req.user._id,
        title: titlePrompt,
        document_id: document_id || null,
        document_ids: document_ids || (document_id ? [document_id] : []),
      });
    }

    // Save user message
    await Message.create({
      conversation_id: convo._id,
      role: 'user',
      content: message,
    });

    const { contextText, sources, topSimilarity, confidence, matchQuality } =
      await retrieveContextChunks(message, document_id || convo.document_id, document_ids || convo.document_ids, req.user._id);

    // Set streaming headers
    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // 1. Emit sources
    res.write(JSON.stringify({ type: 'sources', sources }) + '\n');

    // 2. Emit confidence
    res.write(
      JSON.stringify({
        type: 'confidence',
        confidence,
        match_quality: matchQuality,
        top_similarity: topSimilarity,
      }) + '\n'
    );

    const systemPrompt = buildLegalSystemPrompt(contextText);
    let fullContent = '';

    for await (const token of streamGenerateWithFallback(message, systemPrompt)) {
      fullContent += token;
      res.write(JSON.stringify({ type: 'token', content: token }) + '\n');
    }

    // Save assistant message in DB
    const assistantMsg = await Message.create({
      conversation_id: convo._id,
      role: 'assistant',
      content: fullContent,
      sources,
      confidence,
      match_quality: matchQuality,
      top_similarity: topSimilarity,
    });

    // 3. Emit done
    res.write(
      JSON.stringify({
        type: 'done',
        conversation_id: convo._id.toString(),
        message_id: assistantMsg._id.toString(),
      }) + '\n'
    );

    res.end();
  } catch (error) {
    console.error('[Stream Chat Error]:', error);
    if (!res.headersSent) {
      return res.status(500).json({
        error_code: 'stream_failed',
        message: error.message || 'Streaming failed.',
      });
    }
    res.end();
  }
});

/**
 * GET /conversations
 */
router.get('/conversations', requireAuth, async (req, res) => {
  try {
    const convos = await Conversation.find({ user_id: req.user._id }).sort({ updated_at: -1 });
    return res.json({ conversations: convos.map((c) => c.toJSON()) });
  } catch (error) {
    return res.status(500).json({ error_code: 'internal_error', message: 'Failed to list conversations.' });
  }
});

/**
 * GET /conversations/:id
 */
router.get('/conversations/:id', requireAuth, async (req, res) => {
  try {
    const convo = await Conversation.findOne({ _id: req.params.id, user_id: req.user._id });
    if (!convo) {
      return res.status(404).json({ error_code: 'conversation_not_found', message: 'Conversation not found.' });
    }

    const messages = await Message.find({ conversation_id: convo._id }).sort({ created_at: 1 });
    const convoObj = convo.toJSON();
    convoObj.messages = messages.map((m) => m.toJSON());

    return res.json(convoObj);
  } catch (error) {
    return res.status(404).json({ error_code: 'conversation_not_found', message: 'Conversation not found.' });
  }
});

/**
 * DELETE /conversations/:id
 */
router.delete('/conversations/:id', requireAuth, async (req, res) => {
  try {
    await Message.deleteMany({ conversation_id: req.params.id });
    await Conversation.findOneAndDelete({ _id: req.params.id, user_id: req.user._id });
    return res.status(204).send();
  } catch (error) {
    return res.status(500).json({ error_code: 'delete_failed', message: 'Failed to delete conversation.' });
  }
});

export default router;
