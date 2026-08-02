#!/usr/bin/env bash
set -euo pipefail
BASE="${1:-http://127.0.0.1:8000}"
USER="e2e_$(date +%s)"
PASS="secret12"

echo "== health =="
curl -sf "$BASE/api/health" | grep -q ok

echo "== register =="
TOKEN=$(curl -sf -X POST "$BASE/api/auth/register" -H 'Content-Type: application/json' \
  -d "{\"username\":\"$USER\",\"password\":\"$PASS\"}" | python3 -c 'import sys,json; print(json.load(sys.stdin)["access_token"])')
AUTH="Authorization: Bearer $TOKEN"

echo "== cards =="
curl -sf "$BASE/api/cards?page_size=5" | python3 -c 'import sys,json; d=json.load(sys.stdin); assert d["total"]>=1; print("cards", d["total"])'

echo "== create deck =="
DECK=$(curl -sf -X POST "$BASE/api/decks" -H "$AUTH" -H 'Content-Type: application/json' \
  -d '{"name":"E2E法师","class_slug":"mage","format":"standard"}')
DECK_ID=$(echo "$DECK" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])')

echo "== draft =="
# build 30 cards from first mage/neutral collectibles
python3 - <<PY
import json, urllib.request
req = urllib.request.Request("$BASE/api/cards?class_slug=mage&format=standard&page_size=20")
mage = json.load(urllib.request.urlopen(req))["items"]
req = urllib.request.Request("$BASE/api/cards?class_slug=neutral&format=standard&page_size=20")
neutral = json.load(urllib.request.urlopen(req))["items"]
pool = mage + neutral
cards = []
for c in pool:
    max_c = 1 if c["rarity_slug"] == "legendary" else 2
    cards.append({"card_id": c["id"], "count": max_c})
    if sum(x["count"] for x in cards) >= 30:
        break
# trim to 30
total = sum(x["count"] for x in cards)
while total > 30:
    cards[-1]["count"] -= 1
    if cards[-1]["count"] <= 0:
        cards.pop()
    total = sum(x["count"] for x in cards)
assert total == 30, total
open("/tmp/e2e_deck.json","w").write(json.dumps({"cards": cards}))
print("draft cards", len(cards), "total", total)
PY

curl -sf -X PUT "$BASE/api/decks/$DECK_ID/draft" -H "$AUTH" -H 'Content-Type: application/json' \
  --data @/tmp/e2e_deck.json >/dev/null

echo "== chat =="
curl -sf -X POST "$BASE/api/decks/$DECK_ID/chat" -H "$AUTH" -H 'Content-Type: application/json' \
  -d '{"content":"这套曲线怎么样？"}' | python3 -c 'import sys,json; d=json.load(sys.stdin); assert d["messages"][-1]["role"]=="assistant"; print("chat ok")'

echo "== finalize =="
curl -sf -X POST "$BASE/api/decks/$DECK_ID/finalize" -H "$AUTH" \
  | python3 -c 'import sys,json; d=json.load(sys.stdin); assert d["deck"]["status"]=="completed"; print("finalize ok")'

echo "E2E smoke passed"
