import os

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

os.environ["DATABASE_URL"] = "sqlite://"
os.environ["JWT_SECRET"] = "test-secret"
os.environ["SYNC_API_TOKEN"] = "test-sync"
os.environ["LLM_PROVIDER"] = "mock"
os.environ["AGENT_MEMORY_BACKEND"] = "memory"

from app import database as app_database
from app.config import get_settings
from app.database import Base, get_db
from app.main import app
from app.models import Card, Deck, User
from app.services.deck_agent.memory import reset_agent_memory_for_tests, ensure_agent_memory_ready
from app.services.deck_agent.skills import validate_skill_md
from app.services.deck_agent.tools import build_deck_tools


@pytest.fixture()
def client():
    get_settings.cache_clear()
    reset_agent_memory_for_tests()
    ensure_agent_memory_ready(get_settings())

    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    Base.metadata.create_all(bind=engine)
    # Stream endpoint opens its own session via database.SessionLocal
    original_session_local = app_database.SessionLocal
    app_database.SessionLocal = TestingSessionLocal

    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db

    db = TestingSessionLocal()
    for i in range(15):
        db.add(
            Card(
                id=str(1000 + i),
                name=f"法师卡{i}",
                cost=i % 8,
                class_slug="mage" if i < 10 else "neutral",
                rarity_slug="common",
                card_type="minion",
                set_slug="legacy",
                text="测试",
                collectible=True,
                is_standard=True,
                is_wild=True,
            )
        )
    db.commit()
    db.close()

    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
    app_database.SessionLocal = original_session_local
    reset_agent_memory_for_tests()


def _auth(client: TestClient, username: str = "agent_user") -> dict[str, str]:
    token = client.post(
        "/api/auth/register", json={"username": username, "password": "secret1"}
    ).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_phase_gate_and_thread_memory(client: TestClient):
    headers = _auth(client)
    deck_id = client.post(
        "/api/decks",
        headers=headers,
        json={"name": "教练套", "class_slug": "mage", "format": "standard"},
    ).json()["id"]

    hist = client.get(f"/api/decks/{deck_id}/chat", headers=headers)
    assert hist.status_code == 200
    assert hist.json()["phase"] == "coaching"
    assert hist.json()["thread_id"] == f"user:1:deck:{deck_id}" or hist.json()["thread_id"].startswith(
        "user:"
    )

    chat = client.post(
        f"/api/decks/{deck_id}/chat",
        headers=headers,
        json={"content": "我想打中速控制"},
    )
    assert chat.status_code == 200
    body = chat.json()
    assert body["phase"] == "coaching"
    assert body["patch_applied"] is False
    assert "澄清" in body["messages"][-1]["content"]

    # resume
    hist2 = client.get(f"/api/decks/{deck_id}/chat", headers=headers)
    assert len(hist2.json()["messages"]) >= 2

    # patch blocked while coaching even if user asks
    blocked = client.post(
        f"/api/decks/{deck_id}/chat",
        headers=headers,
        json={"content": "请帮我改套加入卡牌"},
    )
    assert blocked.status_code == 200
    assert blocked.json()["patch_applied"] is False

    started = client.post(f"/api/decks/{deck_id}/chat/start-building", headers=headers)
    assert started.status_code == 200
    assert started.json()["phase"] == "building"

    patched = client.post(
        f"/api/decks/{deck_id}/chat",
        headers=headers,
        json={"content": "请帮我改套加入卡牌"},
    )
    assert patched.status_code == 200
    assert patched.json()["patch_applied"] is True
    assert patched.json()["deck"]["card_count"] >= 1

    back = client.post(f"/api/decks/{deck_id}/chat/return-to-coaching", headers=headers)
    assert back.json()["phase"] == "coaching"


def test_non_owner_phase_denied(client: TestClient):
    h1 = _auth(client, "owner1")
    deck_id = client.post(
        "/api/decks",
        headers=h1,
        json={"name": "私有", "class_slug": "mage", "format": "standard"},
    ).json()["id"]
    h2 = _auth(client, "intruder")
    assert client.post(f"/api/decks/{deck_id}/chat/start-building", headers=h2).status_code == 404


def test_skill_market_pending_and_approve(client: TestClient):
    headers = _auth(client, "skill_author")
    bad = client.post(
        "/api/skills/market",
        headers=headers,
        json={
            "slug": "evil",
            "name": "evil",
            "skill_md": "```python\nprint(1)\n```",
        },
    )
    assert bad.status_code == 400

    ok = client.post(
        "/api/skills/market",
        headers=headers,
        json={
            "slug": "curve-tip",
            "name": "曲线小贴士",
            "description": "test",
            "skill_md": "---\nname: curve-tip\ndescription: tip\n---\n\n# Tip\n保持曲线。\n",
        },
    )
    assert ok.status_code == 201
    pack_id = ok.json()["id"]
    assert ok.json()["status"] == "pending"

    public = client.get("/api/skills/market")
    assert all(p["id"] != pack_id for p in public.json())

    reviewed = client.post(
        f"/api/skills/market/{pack_id}/review",
        headers={"X-Admin-Token": "test-sync"},
        json={"status": "approved"},
    )
    assert reviewed.status_code == 200
    assert reviewed.json()["status"] == "approved"
    public2 = client.get("/api/skills/market")
    assert any(p["id"] == pack_id for p in public2.json())


def test_validate_skill_md_helpers():
    assert validate_skill_md("---\nname: a\n---\n# A\n")[0] is True
    assert validate_skill_md("```bash\nrm -rf /\n```")[0] is False


def test_chat_stream_sse(client: TestClient):
    headers = _auth(client, "stream_user")
    deck_id = client.post(
        "/api/decks",
        headers=headers,
        json={"name": "流式套", "class_slug": "mage", "format": "standard"},
    ).json()["id"]
    with client.stream(
        "POST",
        f"/api/decks/{deck_id}/chat/stream",
        headers=headers,
        json={"content": "我想打中速"},
    ) as res:
        assert res.status_code == 200
        body = "".join(res.iter_text())
    assert "event: status" in body
    assert "event: token" in body
    assert "event: done" in body


def test_store_namespace_isolation():
    from deepagents.backends import StoreBackend
    from langgraph.store.memory import InMemoryStore

    store = InMemoryStore()
    a = StoreBackend(namespace=lambda _rt: ("memories", "user:1"), store=store)
    b = StoreBackend(namespace=lambda _rt: ("memories", "user:2"), store=store)
    a.write("/memories/AGENTS.md", "# prefs-a\n")
    assert a.read("/memories/AGENTS.md").error is None
    assert b.read("/memories/AGENTS.md").error is not None


def test_apply_tool_phase_gate_unit():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Session = sessionmaker(bind=engine)
    Base.metadata.create_all(bind=engine)
    db = Session()
    u = User(username="t", password_hash="x")
    db.add(u)
    db.flush()
    db.add(
        Card(
            id="1000",
            name="卡",
            cost=1,
            class_slug="mage",
            rarity_slug="common",
            card_type="minion",
            set_slug="legacy",
            text="",
            collectible=True,
            is_standard=True,
            is_wild=True,
        )
    )
    deck = Deck(
        user_id=u.id,
        name="d",
        class_slug="mage",
        format="standard",
        status="draft",
        assistant_phase="coaching",
    )
    db.add(deck)
    db.commit()
    db.refresh(deck)
    tools = {t.name: t for t in build_deck_tools(db, deck)}
    out = tools["apply_deck_patch"].invoke({"ops": [{"op": "set_count", "card_id": "1000", "count": 1}]})
    assert "coaching" in out
    deck.assistant_phase = "building"
    db.commit()
    out2 = tools["apply_deck_patch"].invoke({"ops": [{"op": "set_count", "card_id": "1000", "count": 1}]})
    assert "已应用" in out2
    db.close()
