## 1. Portable pack (directory + skills)

- [x] 1.1 Create `backend/card_wiki/` with `SCHEMA.md`, `raw/`, `wiki/{cards,roles,archetypes}/`, `index.md`, `log.md`
- [x] 1.2 Add pack skills: `wiki-query`, `wiki-cold-start`, `wiki-maintain`, `wiki-lint`
- [x] 1.3 Document drop-in usage in `card_wiki/README.md` (no LLM Key / no wiki DB)

## 2. Host wiring (this repo)

- [x] 2.1 Mount `/card_wiki/` via backend filesystem root; deck coach read-only
- [x] 2.2 Deck agent loads only builtin `wiki-query` (not cold-start/maintain/lint); update deck-edit + system prompt
- [x] 2.3 Optional catalog dump script → `raw/_catalog/cards.jsonl` (no LLM)
- [x] 2.4 Remove Key-backed maintainer CLI / `app/services/card_wiki` LLM pipeline

## 3. Specs & smoke

- [x] 3.1 OpenSpec proposal/design/tasks reflect pack delivery
- [x] 3.2 Tests assert pack layout + runtime skills path; no wiki ORM
