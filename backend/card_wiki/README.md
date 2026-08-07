# Card llm-wiki（知识库数据 + SCHEMA）

本目录是 **markdown 知识库本体**（SCHEMA / raw / wiki），不是 Cursor skill 存放处。

## 目录

```
card_wiki/
  README.md
  SCHEMA.md
  raw/<source_id>/          # 不可变原文
  raw/_catalog/cards.jsonl  # 宿主目录快照（可选导出）
  wiki/
    index.md
    log.md
    cards/<card_id>.md
    roles/
    archetypes/
```

## Skills 放哪

| 角色 | 位置 |
|------|------|
| Cursor 维护（冷启动 / ingest / lint） | `.cursor/skills/wiki-cold-start` · `wiki-maintain` · `wiki-lint`（总览 `card-llm-wiki`） |
| 组牌 deepagents 只读查询 | `backend/agent_skills/builtin/wiki-query/` |

组牌 coach 挂载 `backend/`，只读 `/card_wiki/wiki/`；**不**加载维护类 skill。

## 宿主适配

冷启动前导出目录（无 LLM）：

```bash
cd backend && uv run python scripts/export_card_catalog.py
```

## 非目标

- wiki 不进业务数据库  
- 无百科 UI  
- 无带模型 Key 的 maintainer 微服务  
