from app.models import Card, Deck, DeckCard
from app.services.validation import validate_deck


def _card(**kwargs) -> Card:
    defaults = dict(
        id="1",
        name="测试卡",
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
    defaults.update(kwargs)
    return Card(**defaults)


def test_validate_requires_thirty_cards():
    deck = Deck(id=1, user_id=1, name="t", class_slug="mage", format="standard", status="draft")
    deck.cards = [DeckCard(card_id="1", count=2)]
    cards = {"1": _card(id="1")}
    valid, violations, total = validate_deck(deck, cards)
    assert not valid
    assert total == 2
    assert any("30" in v for v in violations)


def test_legendary_limit():
    legend = _card(id="L", name="传说", rarity_slug="legendary")
    deck = Deck(id=1, user_id=1, name="t", class_slug="mage", format="standard", status="draft")
    deck.cards = [DeckCard(card_id="L", count=2)]
    # pad to 30 with neutrals conceptually - we only check legendary violation presence
    valid, violations, _ = validate_deck(deck, {"L": legend})
    assert not valid
    assert any("传说" in v for v in violations)


def test_wrong_class_and_format():
    wrong = _card(id="W", name="斩杀", class_slug="warrior", is_standard=False, is_wild=True)
    deck = Deck(id=1, user_id=1, name="t", class_slug="mage", format="standard", status="draft")
    deck.cards = [DeckCard(card_id="W", count=2)]
    valid, violations, _ = validate_deck(deck, {"W": wrong})
    assert not valid
    assert any("职业" in v or "不属于" in v for v in violations)
    assert any("标准" in v for v in violations)


def test_legal_thirty():
    cards = {}
    deck_cards = []
    for i in range(15):
        cid = str(i + 1)
        cards[cid] = _card(id=cid, name=f"卡{i}", class_slug="mage" if i < 10 else "neutral")
        deck_cards.append(DeckCard(card_id=cid, count=2))
    deck = Deck(id=1, user_id=1, name="t", class_slug="mage", format="standard", status="draft")
    deck.cards = deck_cards
    valid, violations, total = validate_deck(deck, cards)
    assert total == 30
    assert valid
    assert violations == []
