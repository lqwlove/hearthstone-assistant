from __future__ import annotations

from app.services.deck_agent.skills import BACKEND_ROOT

REPO = BACKEND_ROOT.parent
CURSOR_SKILLS = REPO / ".cursor" / "skills"


def test_card_wiki_data_layout():
    root = BACKEND_ROOT / "card_wiki"
    assert (root / "README.md").exists()
    assert (root / "SCHEMA.md").exists()
    assert (root / "wiki" / "index.md").exists()
    assert (root / "wiki" / "log.md").exists()
    assert not (root / "skills").exists()


def test_schema_rejects_db_persistence():
    schema = (BACKEND_ROOT / "card_wiki" / "SCHEMA.md").read_text(encoding="utf-8")
    assert "数据库" in schema


def test_cursor_maintain_skills():
    for name in ("wiki-cold-start", "wiki-maintain", "wiki-lint", "card-llm-wiki"):
        skill = CURSOR_SKILLS / name / "SKILL.md"
        assert skill.exists(), name
        assert f"name: {name}" in skill.read_text(encoding="utf-8")


def test_deck_agent_uses_wiki_query_skill_not_search_tool():
    src = (BACKEND_ROOT / "app" / "services" / "deck_agent" / "tools.py").read_text(encoding="utf-8")
    assert "def search_cards" not in src
    assert "def wiki_query" not in src
    skill = BACKEND_ROOT / "agent_skills" / "builtin" / "wiki-query" / "SKILL.md"
    assert skill.exists()
    text = skill.read_text(encoding="utf-8")
    assert "grep" in text and "/card_wiki/wiki/" in text


def test_no_wiki_orm_or_llm_cli():
    import app.models as models

    assert not any("Wiki" in n for n in dir(models))
    assert not (BACKEND_ROOT / "scripts" / "card_wiki_cli.py").exists()
    assert not (BACKEND_ROOT / "app" / "services" / "card_wiki").exists()
