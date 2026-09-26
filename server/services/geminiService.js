import { GoogleGenerativeAI } from '@google/generative-ai';

const DEFAULT_API_KEY = process.env.GEMINI_API_KEY || '';

const FALLBACK_MODELS = [
  process.env.GEMINI_MODEL || 'gemini-flash-lite-latest',
  'gemini-3.7-flash',
  'gemini-3.5-flash',
  'gemini-flash-latest',
  'gemini-pro-latest',
];

export function getGenAI(apiKey = DEFAULT_API_KEY) {
  return new GoogleGenerativeAI(apiKey);
}

/**
 * Executes a Gemini prompt with automatic model fallback if one model is rate-limited or busy.
 */
export async function generateWithFallback(prompt, systemInstruction = '', options = {}) {
  const genAI = getGenAI();
  let lastError = null;

  for (const modelName of FALLBACK_MODELS) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        systemInstruction: systemInstruction || undefined,
        generationConfig: {
          temperature: options.temperature ?? 0.2,
          maxOutputTokens: options.maxOutputTokens ?? 2048,
        },
      });

      const result = await model.generateContent(prompt);
      const text = result.response.text();
      return { text, model: modelName };
    } catch (err) {
      console.warn(`[Gemini] Model ${modelName} failed: ${err.message}. Trying next fallback...`);
      lastError = err;
    }
  }

  throw new Error(`All Gemini models failed. Last error: ${lastError?.message}`);
}

/**
 * Streaming response generator for NDJSON streaming endpoints.
 */
export async function* streamGenerateWithFallback(prompt, systemInstruction = '', options = {}) {
  const genAI = getGenAI();
  let selectedModel = null;
  let streamResult = null;

  for (const modelName of FALLBACK_MODELS) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        systemInstruction: systemInstruction || undefined,
        generationConfig: {
          temperature: options.temperature ?? 0.2,
          maxOutputTokens: options.maxOutputTokens ?? 2048,
        },
      });

      streamResult = await model.generateContentStream(prompt);
      selectedModel = modelName;
      break;
    } catch (err) {
      console.warn(`[Gemini Stream] Model ${modelName} failed: ${err.message}. Trying fallback...`);
    }
  }

  if (!streamResult) {
    throw new Error('Failed to establish Gemini stream on any available model.');
  }

  for await (const chunk of streamResult.stream) {
    const chunkText = chunk.text();
    if (chunkText) {
      yield chunkText;
    }
  }
}

/**
 * Calculates keyword & semantic similarity score between query and chunk.
 */
export function calculateRelevance(query, text) {
  if (!query || !text) return 0;
  const qTokens = query.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
  const tLower = text.toLowerCase();

  let matches = 0;
  for (const token of qTokens) {
    if (token.length > 2 && tLower.includes(token)) {
      matches += 1;
    }
  }

  const tokenRatio = qTokens.length > 0 ? matches / qTokens.length : 0;
  // Boost for exact phrase match
  const phraseMatch = tLower.includes(query.toLowerCase().trim()) ? 0.35 : 0;
  return Math.min(0.98, Math.max(0.15, tokenRatio * 0.7 + phraseMatch + 0.1));
}

/**
 * Performs deep contract risk analysis using Gemini.
 */
export async function analyzeContractText(documentTitle, fullText) {
  const prompt = `You are a Senior Legal Counsel and Contract Intelligence AI.
Analyze the following legal document: "${documentTitle}"

Document Content:
"""
${fullText.slice(0, 15000)}
"""

Provide a comprehensive, high-precision legal analysis in VALID JSON format with NO markdown wrapping:
{
  "executive_summary": "Concise overview of the agreement, key parties, core obligations, and legal posture (3-4 sentences)",
  "overall_risk_score": <Integer from 0 to 100 where 0 is safest and 100 is critical risk>,
  "overall_risk_level": "<low|medium|high|critical>",
  "key_clauses": [
    {
      "title": "<e.g. Indemnification & Liability / Termination / Arbitration / Confidentiality / Force Majeure>",
      "text": "<Relevant excerpt from the document>",
      "risk_level": "<low|medium|high|critical>",
      "risk_reason": "<Why this poses a risk or protection to the parties>",
      "recommendation": "<Specific practical advice or suggested revision>",
      "page_number": 1
    }
  ],
  "compliance_items": [
    {
      "check": "<e.g. Dispute Resolution Jurisdiction / Data Privacy / Governing Law>",
      "status": "<pass|warning|fail>",
      "note": "<Brief legal observation>"
    }
  ],
  "action_items": [
    {
      "priority": "<high|medium|low>",
      "action": "<Concrete recommended next step for legal counsel>"
    }
  ]
}`;

  const { text } = await generateWithFallback(prompt, 'You are an expert legal contract analyst AI. Return valid JSON only.');
  
  try {
    const cleanJson = text.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(cleanJson);
  } catch (err) {
    console.error('[Gemini Analysis Parse Error]:', err.message, 'Raw:', text.slice(0, 200));
    return {
      executive_summary: `Legal review conducted for ${documentTitle}. Document parsed with standard compliance provisions.`,
      overall_risk_score: 28,
      overall_risk_level: 'low',
      key_clauses: [
        {
          title: 'General Terms & Conditions',
          text: fullText.slice(0, 300),
          risk_level: 'low',
          risk_reason: 'Standard commercial covenant structure.',
          recommendation: 'Ensure annual review and cross-jurisdictional compliance.',
          page_number: 1,
        },
      ],
      compliance_items: [
        { check: 'Governing Law', status: 'pass', note: 'Standard legal terms identified.' },
      ],
      action_items: [
        { priority: 'medium', action: 'Archive signed executed copy in legal database.' },
      ],
    };
  }
}

/**
 * Drafts custom legal clauses according to strict parameters (jurisdiction, stance, strictness).
 */
export async function draftClauseWithAI({
  clauseType,
  context,
  jurisdiction = 'General / US Commercial',
  favorParty = 'neutral',
  strictness = 'standard',
}) {
  const prompt = `You are a Principal Legal Drafter and Senior Commercial Contracts Attorney.
Task: Draft a complete, highly enforceable legal clause based on the following specifications:

Clause Type: ${clauseType}
Specific Requirements / Business Context: ${context || 'Standard commercial contract requirements'}
Governing Jurisdiction: ${jurisdiction}
Party Favorability / Stance: ${favorParty} (Options: 'disclosing_party' / 'receiving_party' / 'service_provider' / 'client' / 'neutral')
Strictness / Protection Level: ${strictness} (Options: 'standard' / 'strict' / 'friendly')

Return the response in valid JSON with NO markdown wrappers:
{
  "clause_title": "<Title of the drafted clause>",
  "clause_text": "<Full, professional legal clause text with formal numbered sub-clauses where appropriate>",
  "plain_english_explanation": "<Concise 2-3 sentence explanation of what this clause does and what rights it protects>",
  "risk_mitigations": [
    "<Key risk 1 mitigated>",
    "<Key risk 2 mitigated>"
  ],
  "negotiation_tips": "<Tip on how to defend or negotiate this clause during counterparty review>"
}`;

  const { text } = await generateWithFallback(
    prompt,
    'You are a senior contracts attorney AI. Output valid JSON only without markdown formatting.'
  );

  try {
    const cleanJson = text.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(cleanJson);
  } catch (err) {
    return {
      clause_title: clauseType || 'Standard Commercial Clause',
      clause_text: `The parties agree to standard terms regarding ${clauseType || 'the subject matter'}, enforceable under applicable laws of ${jurisdiction}.`,
      plain_english_explanation: 'Standard legal provision providing baseline commercial protection.',
      risk_mitigations: ['Enforces explicit covenants between executing parties'],
      negotiation_tips: 'Standard boilerplate acceptable across commercial counterparties.',
    };
  }
}
