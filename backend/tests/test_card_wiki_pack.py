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


def test_deck_agent_only_loads_wiki_query():
    src = (BACKEND_ROOT / "app" / "services" / "deck_agent" / "runtime.py").read_text(encoding="utf-8")
    assert '"/card_wiki/skills/"' not in src
    wiki_query = BACKEND_ROOT / "agent_skills" / "builtin" / "wiki-query" / "SKILL.md"
    assert wiki_query.exists()
    assert "wiki-query" in wiki_query.read_text(encoding="utf-8")


def test_no_wiki_orm_or_llm_cli():
    import app.models as models

    assert not any("Wiki" in n for n in dir(models))
    assert not (BACKEND_ROOT / "scripts" / "card_wiki_cli.py").exists()
    assert not (BACKEND_ROOT / "app" / "services" / "card_wiki").exists()
