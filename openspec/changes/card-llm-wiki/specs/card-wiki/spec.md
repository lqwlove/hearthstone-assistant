## Purpose

Provides a filesystem llm-wiki of card and deckbuilding knowledge that an agent compiles and updates from sources, without storing wiki content in the application database and without a user-facing wiki UI.

## ADDED Requirements

### Requirement: Filesystem wiki, not application DB
The card knowledge wiki MUST be stored as files under a dedicated backend data directory (raw sources, wiki pages, schema). The system MUST NOT persist wiki page bodies or compiled advice into application database tables as the wiki store.

#### Scenario: Wiki updates write files
- **WHEN** the maintainer agent completes an ingest that changes card advice
- **THEN** the change MUST appear in wiki markdown (or equivalent wiki files) and MUST NOT require a new wiki ORM table to be the source of truth

### Requirement: Schema governs agent maintenance
The system MUST provide a schema document that defines page types, naming, frontmatter, ingest/query/lint workflows, and the conflict rule that for the same format and same deck strategy, newer advice overwrites older advice.

#### Scenario: Schema states overwrite rule
- **WHEN** an operator or maintainer agent reads the schema
- **THEN** the overwrite rule for `(format, strategy)` MUST be specified

### Requirement: Full-catalog thin pages on cold start
The system MUST be able to generate a wiki card page for every collectible card in the local card catalog, keyed by `card_id`, using catalog facts as anchors and initial understanding for thin content, without prior article ingest.

#### Scenario: Cold start creates card pages
- **WHEN** cold-start generation runs against a populated card catalog
- **THEN** each collectible card MUST have a wiki card page file whose metadata includes at least `card_id`

### Requirement: Agent understands sources and updates wiki
The system MUST support an ingest workflow where a maintainer agent reads a new raw source, compiles understanding, and updates the relevant wiki pages automatically (no mandatory human approval in MVP).

#### Scenario: Same format and strategy overwrite
- **WHEN** a new source is ingested for the same format and same deck strategy as existing advice on a page
- **THEN** the maintainer agent MUST replace that prior advice on the wiki page and record provenance pointing at the new raw source

### Requirement: Catalog remains factual authority
Official card identity facts (id, name, cost, collectibility, format eligibility, official text) MUST remain authoritative in the card catalog. Wiki prose MUST NOT be used alone to validate deck legality.

#### Scenario: Unknown card id cannot be played from wiki alone
- **WHEN** wiki text mentions a card id absent from the catalog
- **THEN** deck mutation tools MUST still reject that id

### Requirement: Portable skills pack
The card wiki MUST be delivered as a directory pack containing schema, wiki/raw trees, and skills (`wiki-query`, `wiki-cold-start`, `wiki-maintain`, `wiki-lint`) so a host agent framework can load the skills and operate on the files without a separate model-key maintainer service.

#### Scenario: Pack contains maintain and query skills
- **WHEN** an operator inspects the card wiki pack
- **THEN** the skills directory MUST include wiki-query and wiki-maintain skill documents that instruct the host agent to read or write markdown under the pack

### Requirement: Deck agent queries wiki via skill
The system MUST expose the pack's wiki-query skill to the deck agent and MUST mount the wiki for read access through the deepagents skills/filesystem path. No user-facing wiki browsing UI is required.

#### Scenario: Skill documents retrieval
- **WHEN** the deck agent needs card or role semantics beyond archetype reference tables
- **THEN** it MUST follow the wiki-query skill to open relevant wiki pages rather than inventing unsupported card ids
