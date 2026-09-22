from app.services.chunking_service import chunk_text, clean_text


def test_clean_text_collapses_whitespace():
    raw = "Hello    world\n\n\n\nSecond   paragraph"
    cleaned = clean_text(raw)
    assert "    " not in cleaned
    assert "\n\n\n" not in cleaned


def test_clean_text_fixes_hyphenated_linebreaks():
    raw = "There-\nfore the parties agree."
    cleaned = clean_text(raw)
    assert "Therefore" in cleaned


def test_chunk_text_empty_returns_no_chunks():
    assert chunk_text("") == []
    assert chunk_text("   ") == []


def test_chunk_text_respects_chunk_size_roughly():
    text = "Clause A applies to all parties. " * 100
    chunks = chunk_text(text, chunk_size=200, chunk_overlap=20)
    assert len(chunks) > 1
    for c in chunks:
        # allow overlap to push slightly over
        assert len(c.text) <= 200 + 20 + 5


def test_chunk_text_has_overlap_between_consecutive_chunks():
    text = ("Section 1: Definitions. " * 20) + ("Section 2: Obligations. " * 20)
    chunks = chunk_text(text, chunk_size=150, chunk_overlap=30)
    assert len(chunks) > 1
    # the tail of chunk[i] should share text with the head of chunk[i+1]
    tail = chunks[0].text[-30:]
    assert tail[:10] in chunks[1].text or tail in chunks[1].text


def test_chunk_indices_are_sequential():
    text = "word " * 500
    chunks = chunk_text(text, chunk_size=100, chunk_overlap=10)
    indices = [c.index for c in chunks]
    assert indices == list(range(len(chunks)))
