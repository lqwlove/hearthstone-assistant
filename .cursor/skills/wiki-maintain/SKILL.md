---
name: wiki-maintain
description: >-
  炉石 card wiki 维护/ingest：理解文章或笔记，更新 wiki markdown。
  用户说灌文章、ingest、更新卡牌建议、充实 wiki 时使用。同 format+strategy 覆盖旧 advice。
---

# Wiki 维护 / Ingest（wiki-maintain）

先读 `backend/card_wiki/SCHEMA.md` 与 `backend/card_wiki/wiki/index.md`。

## 输入

用户给出文章路径、粘贴正文，或已有 `backend/card_wiki/raw/<source_id>/`。

## 步骤

1. **落盘原文（不可变）**  
   若尚未在 raw：写入 `backend/card_wiki/raw/<source_id>/source.md`。已存在的 raw 勿改；新版本用新 `source_id`。

2. **理解 → 编译**  
   提取 `card_id`（或能唯一对应目录的卡名）、`format`、`strategy_key`、advice。  
   只使用目录快照中存在的 `card_id`；未知 id **丢弃**并列出。

3. **更新页面**  
   打开/创建 `wiki/cards/<card_id>.md`：  
   - **覆盖** `strategies.<format>::<strategy_key>`（`advice` / `source_id` / `updated_at`）  
   - 正文同 strategy 段落也覆盖  
   - 可选更新 `roles/`、`archetypes/`

4. **收尾**  
   - 刷新 `wiki/index.md`（大改则全量重建）  
   - 追加 `wiki/log.md`：`ISO时间 | ingest | <source_id> | updated K cards`

## 冲突规则

同一 `format` + `strategy_key` → **新覆盖旧**。

## 原则

- 直接读写 markdown；官方费用/稀有度以目录为准。
