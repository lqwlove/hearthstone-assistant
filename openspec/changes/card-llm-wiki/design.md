## Context

See proposal.md. Delivery is a **portable directory + skills pack**, not a Key-backed maintainer service. Host agent frameworks run the skills with their own agent runtime.

## Goals / Non-Goals

**Goals:**
- Pack: `SCHEMA.md` + `skills/` + `raw/` + `wiki/`
- Drop into any file+skills agent framework
- Cold-start / ingest / lint / query as skills (agent writes/reads markdown)
- Overwrite: same format + strategy → new advice wins
- Deck coach: read-only `wiki-query`

**Non-Goals:**
- Wiki in Postgres
- Wiki UI
- Python CLI that calls LangChain with `LLM_API_KEY` for maintain
- Replacing archetype skills or `search_cards`

## Decisions

### 1. Pack layout = product
Path: `backend/card_wiki/` with nested `skills/`. README documents how to mount elsewhere.

### 2. Skills are the API
- `wiki-query` — read
- `wiki-cold-start` — thin pages from catalog snapshot
- `wiki-maintain` — ingest
- `wiki-lint` — checks

No separate model configuration for wiki; the host agent is the worker.

### 3. Host catalog adapter (optional)
This repo may dump `raw/_catalog/cards.jsonl` via a tiny script (no LLM). Other hosts provide equivalent snapshot or tools.

### 4. Two roles in this app
- Deck coach: read `/card_wiki/`, skills include pack path; write denied on wiki
- Maintainer: external/Cursor agent with write access to the pack, following maintain skills

### 5. Conflict + facts
`(format, strategy_key)` overwrite; catalog remains legality authority.

## Migration Plan

1. Ship pack (SCHEMA + skills + empty wiki templates)
2. Wire deepagents skills path
3. Export catalog jsonl when cold-starting in this host
4. Rollback: remove skills path / ignore pack

## Open Questions

None.
