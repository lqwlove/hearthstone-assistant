import os

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

# Ensure test DB before app import side effects
os.environ["DATABASE_URL"] = "sqlite://"
os.environ["JWT_SECRET"] = "test-secret"
os.environ["SYNC_API_TOKEN"] = "test-sync"
os.environ["LLM_PROVIDER"] = "mock"
os.environ["AGENT_MEMORY_BACKEND"] = "memory"

from app.config import get_settings
from app.database import Base, get_db
from app.main import app
from app.models import Card
from app.services.deck_agent.memory import ensure_agent_memory_ready, reset_agent_memory_for_tests


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

    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db

    # seed cards
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
    db.add(
        Card(
            id="2000",
            name="传说法师",
            cost=5,
            class_slug="mage",
            rarity_slug="legendary",
            card_type="minion",
            set_slug="legacy",
            text="",
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


def test_register_login_and_reject_duplicate(client: TestClient):
    r = client.post("/api/auth/register", json={"username": "alice", "password": "secret1"})
    assert r.status_code == 200
    assert "access_token" in r.json()

    r2 = client.post("/api/auth/register", json={"username": "alice", "password": "secret1"})
    assert r2.status_code == 400

    bad = client.post("/api/auth/login", json={"username": "alice", "password": "wrong"})
    assert bad.status_code == 401

    ok = client.post("/api/auth/login", json={"username": "alice", "password": "secret1"})
    assert ok.status_code == 200


def test_decks_require_auth(client: TestClient):
    assert client.get("/api/decks").status_code == 401


def test_deck_draft_finalize_and_chat(client: TestClient):
    token = client.post("/api/auth/register", json={"username": "bob", "password": "secret1"}).json()[
        "access_token"
    ]
    headers = {"Authorization": f"Bearer {token}"}

    created = client.post(
        "/api/decks",
        headers=headers,
        json={"name": "法师测试", "class_slug": "mage", "format": "standard"},
    )
    assert created.status_code == 201
    deck_id = created.json()["id"]

    # isolation: other user cannot read
    token2 = client.post("/api/auth/register", json={"username": "carol", "password": "secret1"}).json()[
        "access_token"
    ]
    deny = client.get(f"/api/decks/{deck_id}", headers={"Authorization": f"Bearer {token2}"})
    assert deny.status_code == 404

    cards = [{"card_id": str(1000 + i), "count": 2} for i in range(15)]
    draft = client.put(
        f"/api/decks/{deck_id}/draft",
        headers=headers,
        json={"cards": cards[:3]},
    )
    assert draft.status_code == 200
    assert draft.json()["status"] == "draft"
    assert draft.json()["card_count"] == 6

    # finalize incomplete should fail
    bad_final = client.post(f"/api/decks/{deck_id}/finalize", headers=headers)
    assert bad_final.status_code == 400

    full = client.put(
        f"/api/decks/{deck_id}/draft",
        headers=headers,
        json={"cards": cards},
    )
    assert full.status_code == 200
    final = client.post(f"/api/decks/{deck_id}/finalize", headers=headers)
    assert final.status_code == 200
    assert final.json()["deck"]["status"] == "completed"

    # chat: coaching first, then start building for mock patch
    chat = client.post(
        f"/api/decks/{deck_id}/chat",
        headers=headers,
        json={"content": "我想打中速"},
    )
    assert chat.status_code == 200
    body = chat.json()
    assert len(body["messages"]) == 2
    assert body["messages"][1]["role"] == "assistant"
    assert body["phase"] == "coaching"

    assert client.post(f"/api/decks/{deck_id}/chat/start-building", headers=headers).status_code == 200
    patched = client.post(
        f"/api/decks/{deck_id}/chat",
        headers=headers,
        json={"content": "请帮我改套加入卡牌"},
    )
    assert patched.status_code == 200
    assert patched.json()["patch_applied"] is True

    hist = client.get(f"/api/decks/{deck_id}/chat", headers=headers)
    assert hist.status_code == 200
    assert len(hist.json()["messages"]) >= 2


def test_card_filters(client: TestClient):
    res = client.get("/api/cards", params={"class_slug": "mage", "q": "法师"})
    assert res.status_code == 200
    data = res.json()
    assert data["total"] >= 1
    assert all("法师" in c["name"] or c["class_slug"] == "mage" for c in data["items"])
