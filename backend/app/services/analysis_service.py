"""
Contract & risk analysis service.

Reuses the full text of a processed document (re-extracted from disk) and
asks the active LLM provider to return a strict JSON structure: summary,
key clauses, parties, obligations, and a risk breakdown. This keeps the
same provider-agnostic LLM abstraction used by chat -- no separate
integration needed.
"""
import json
import re

from app.config import settings
from app.core.exceptions import LLMProviderError
from app.services import pdf_service
from app.services.llm.factory import get_llm_provider

ANALYSIS_SYSTEM_PROMPT = """You are LegalGPT's contract analysis engine. You will be given the \
full text of a legal document. Analyze it and respond with ONLY a single valid JSON object \
(no markdown fences, no commentary) matching exactly this schema:

{
  "summary": "2-4 sentence plain-English summary of the document",
  "key_clauses": ["short description of each notable clause"],
  "parties": ["party name or role, e.g. 'Acme Corp (Vendor)'"],
  "obligations": ["short description of each material obligation found"],
  "risks": [
    {
      "clause": "short label for the clause this risk relates to",
      "risk_level": "low | medium | high | critical",
      "explanation": "why this is risky",
      "recommendation": "what the user should consider doing about it"
    }
  ]
}

If the document is truncated, analyze what is available. Never fabricate parties or clauses \
that are not present in the text."""


def _extract_json(raw: str) -> dict:
    # Strip markdown code fences if the model added them despite instructions.
    match = re.search(r"\{.*\}", raw, re.DOTALL)
    if not match:
        raise LLMProviderError("The AI did not return valid JSON for the analysis.")
    return json.loads(match.group(0))


async def analyze_document(file_path: str, max_chars: int = 12000) -> dict:
    pdf_data = pdf_service.extract_text(file_path)
    text = pdf_data["text"][:max_chars]

    provider = get_llm_provider()
    messages = [
        {"role": "system", "content": ANALYSIS_SYSTEM_PROMPT},
        {"role": "user", "content": f"Document text:\n\n{text}"},
    ]
    raw = await provider.generate(
        messages, temperature=0.1, max_tokens=settings.llm_max_tokens
    )

    try:
        data = _extract_json(raw)
    except (json.JSONDecodeError, LLMProviderError) as exc:
        raise LLMProviderError(f"Failed to parse analysis result: {exc}") from exc

    data.setdefault("summary", "")
    data.setdefault("key_clauses", [])
    data.setdefault("parties", [])
    data.setdefault("obligations", [])
    data.setdefault("risks", [])
    return data
