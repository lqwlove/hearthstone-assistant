## ADDED Requirements

### Requirement: Deck agent may use filesystem card wiki for semantics
The deck assistant MUST be able to consult the filesystem card llm-wiki (via the wiki-query skill and readable wiki mount) when selecting or explaining cards, while still using archetype skills for strategy framing, catalog search when needed, and deck patch/validation for mutations. Wiki content is not loaded from application DB tables.

#### Scenario: Wiki complements archetype and search
- **WHEN** the agent is filling a deck toward a legal 30-card list and archetype reference tables are insufficient
- **THEN** the agent MUST be allowed to query the card wiki for role/advice context and MUST still use real `card_id` values from wiki metadata and/or catalog search before applying a deck patch

#### Scenario: Wiki does not replace validation
- **WHEN** wiki advice conflicts with deck construction rules
- **THEN** validation and patch application MUST enforce catalog and rule constraints over wiki suggestions
