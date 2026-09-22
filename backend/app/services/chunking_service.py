"""
Document chunking service.

Splits cleaned document text into overlapping chunks sized for embedding +
retrieval. Uses a recursive character splitter that prefers to break on
paragraph/sentence boundaries before falling back to hard character cuts --
important for legal text where clause boundaries matter.
"""
import re
from dataclasses import dataclass

from app.config import settings


@dataclass
class Chunk:
    index: int
    text: str
    char_start: int
    char_end: int


def _recursive_split(text: str, chunk_size: int, chunk_overlap: int) -> list[str]:
    """Minimal, dependency-free re-implementation of a recursive character
    text splitter (avoids pulling in langchain's heavy transformers/torch
    dependency chain just to split strings).

    Tries separators in order of preference (paragraph -> line -> sentence
    -> word -> character) so chunks break on natural boundaries wherever
    possible, then stitches pieces back together up to chunk_size with
    chunk_overlap carried between consecutive chunks.
    """
    separators = ["\n\n", "\n", ". ", " ", ""]

    def split_on_separators(txt: str, seps: list[str]) -> list[str]:
        if not seps:
            return [txt]
        sep = seps[0]
        if sep == "":
            return list(txt)
        parts = txt.split(sep)
        # Re-attach separator (except for the very last split segment) so
        # length accounting and readability stay correct.
        rejoined = []
        for i, part in enumerate(parts):
            if i < len(parts) - 1:
                rejoined.append(part + sep)
            elif part:
                rejoined.append(part)
        return [p for p in rejoined if p]

    def _split_recursive(txt: str, size: int, seps: list[str]) -> list[str]:
        if len(txt) <= size or not seps:
            return [txt] if txt else []
        pieces = split_on_separators(txt, seps)
        out: list[str] = []
        current = ""
        for piece in pieces:
            if len(current) + len(piece) <= size:
                current += piece
            else:
                if current:
                    out.append(current)
                if len(piece) > size:
                    out.extend(_split_recursive(piece, size, seps[1:]))
                    current = ""
                else:
                    current = piece
        if current:
            out.append(current)
        return out

    raw_chunks = _split_recursive(text, chunk_size, separators)

    if chunk_overlap <= 0 or len(raw_chunks) <= 1:
        return raw_chunks

    # Apply overlap by prepending a trailing slice of the previous chunk.
    overlapped: list[str] = []
    for i, chunk in enumerate(raw_chunks):
        if i == 0:
            overlapped.append(chunk)
            continue
        prev_tail = raw_chunks[i - 1][-chunk_overlap:]
        overlapped.append(prev_tail + chunk)
    return overlapped


def clean_text(raw_text: str) -> str:
    """Normalize whitespace/artifacts left over from PDF extraction."""
    text = raw_text.replace("\x00", "")
    # Collapse excessive whitespace but keep paragraph breaks
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    # Fix hyphenated line-break words e.g. "there-\nfore" -> "therefore"
    text = re.sub(r"(\w)-\n(\w)", r"\1\2", text)
    return text.strip()


def chunk_text(
    text: str,
    chunk_size: int | None = None,
    chunk_overlap: int | None = None,
) -> list[Chunk]:
    """Split cleaned text into overlapping Chunk objects."""
    cleaned = clean_text(text)
    if not cleaned:
        return []

    pieces = _recursive_split(
        cleaned,
        chunk_size=chunk_size or settings.chunk_size,
        chunk_overlap=chunk_overlap or settings.chunk_overlap,
    )

    chunks: list[Chunk] = []
    cursor = 0
    for i, piece in enumerate(pieces):
        start = cleaned.find(piece, max(cursor - settings.chunk_overlap, 0))
        if start == -1:
            start = cursor
        end = start + len(piece)
        chunks.append(Chunk(index=i, text=piece, char_start=start, char_end=end))
        cursor = end

    return chunks
