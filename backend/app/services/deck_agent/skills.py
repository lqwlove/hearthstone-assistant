from __future__ import annotations

import re
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import SkillPack

BACKEND_ROOT = Path(__file__).resolve().parents[3]
BUILTIN_SKILLS_DIR = BACKEND_ROOT / "agent_skills" / "builtin"
MARKET_SKILLS_DIR = BACKEND_ROOT / "data" / "skill_market"

FORBIDDEN_EXT = {
    ".py",
    ".pyw",
    ".sh",
    ".bash",
    ".zsh",
    ".ps1",
    ".bat",
    ".cmd",
    ".exe",
    ".dll",
    ".so",
    ".js",
    ".mjs",
    ".cjs",
    ".ts",
    ".tsx",
    ".jsx",
    ".wasm",
    ".php",
    ".rb",
    ".pl",
}


def ensure_skill_dirs() -> None:
    BUILTIN_SKILLS_DIR.mkdir(parents=True, exist_ok=True)
    MARKET_SKILLS_DIR.mkdir(parents=True, exist_ok=True)


def materialize_approved_skills(db: Session) -> Path:
    """Write approved packs to disk under MARKET_SKILLS_DIR; return market root."""
    ensure_skill_dirs()
    approved = db.scalars(select(SkillPack).where(SkillPack.status == "approved")).all()
    # Clear stale dirs for packs no longer approved
    existing = {p.name for p in MARKET_SKILLS_DIR.iterdir() if p.is_dir()} if MARKET_SKILLS_DIR.exists() else set()
    keep: set[str] = set()
    for pack in approved:
        dir_name = f"{pack.slug}__{pack.version}".replace("/", "_")
        keep.add(dir_name)
        target = MARKET_SKILLS_DIR / dir_name
        target.mkdir(parents=True, exist_ok=True)
        (target / "SKILL.md").write_text(pack.skill_md, encoding="utf-8")
    for name in existing - keep:
        stale = MARKET_SKILLS_DIR / name
        for child in stale.glob("*"):
            if child.is_file():
                child.unlink()
        stale.rmdir()
    return MARKET_SKILLS_DIR


def skill_source_roots(db: Session) -> list[Path]:
    """Builtin first, then approved market (later override same name)."""
    ensure_skill_dirs()
    materialize_approved_skills(db)
    roots = [BUILTIN_SKILLS_DIR]
    if any(MARKET_SKILLS_DIR.iterdir()):
        roots.append(MARKET_SKILLS_DIR)
    return roots


def validate_skill_md(skill_md: str) -> tuple[bool, str]:
    text = (skill_md or "").strip()
    if not text:
        return False, "SKILL.md 不能为空"
    if len(text) > 200_000:
        return False, "SKILL.md 过大"
    if re.search(r"```(?:python|bash|sh|javascript|typescript|powershell)", text, re.I):
        return False, "技能包不得包含可执行代码块"
    if "tools:" in text.lower() and re.search(r"(?m)^tools\s*:", text):
        return False, "技能包不得声明 tools"
    # frontmatter name
    if not re.search(r"(?m)^(?:---\s*\n)?name\s*:", text) and "# " not in text[:200]:
        return False, "SKILL.md 需包含 name 元数据或标题"
    return True, ""


def reject_executable_filename(filename: str) -> str | None:
    lower = filename.lower()
    for ext in FORBIDDEN_EXT:
        if lower.endswith(ext):
            return f"不允许的文件类型: {ext}"
    return None
