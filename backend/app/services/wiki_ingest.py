import asyncio
import hashlib
import json
import re
from datetime import date, datetime, timezone
from uuid import UUID

import httpx
from loguru import logger
from sqlalchemy import delete, select

from app.core.crypto import decrypt_value
from app.db import get_session
from app.models import ModelConfig, WikiIngestJob, WikiLink, WikiPage, WikiSourcePage, WikiSpace, WikiSource
from app.services.wiki_utils import source_count

# ── LLM 调用（精简，仅 ingest 使用） ──────────────────────────

_LLM_TIMEOUT = httpx.Timeout(connect=15.0, read=300.0, write=300.0, pool=15.0)
_RETRY_ATTEMPTS = 3
_RETRY_BASE = 1.0  # 初始退避秒数

_cached_runtime: dict | None = None


def _llm_runtime(invalidate: bool = False) -> dict:
    global _cached_runtime
    if _cached_runtime is None or invalidate:
        with get_session() as session:
            m = session.scalar(select(ModelConfig).where(ModelConfig.is_selected == True).limit(1))
            if m is None:
                raise RuntimeError("未配置 LLM 模型，请在设置中添加并选中一个模型")
            _cached_runtime = {"model": m.model_name, "base_url": m.base_url.rstrip("/"), "api_key": decrypt_value(m.encrypted_api_key) if m.encrypted_api_key else ""}
    return _cached_runtime


def _is_retryable(status: int) -> bool:
    return status in (429,) or 500 <= status < 600


async def _llm_call(messages: list[dict], **overrides) -> str:
    cfg = _llm_runtime()
    base = cfg["base_url"] + ("/chat/completions" if "/v1" in cfg["base_url"] else "/v1/chat/completions")
    payload = {"model": cfg["model"], "messages": messages, "temperature": overrides.get("temperature", 0.1), "max_tokens": overrides.get("max_tokens", 4096), "stream": False}
    headers = {"Content-Type": "application/json", "Authorization": f"Bearer {cfg['api_key']}"}

    last_err: Exception | None = None
    for attempt in range(_RETRY_ATTEMPTS):
        try:
            async with httpx.AsyncClient(timeout=_LLM_TIMEOUT) as c:
                r = await c.post(base, json=payload, headers=headers)
                if r.status_code == 200:
                    return r.json().get("choices", [{}])[0].get("message", {}).get("content", "")
                if not _is_retryable(r.status_code):
                    raise RuntimeError(f"LLM 请求失败: {r.status_code} {r.text[:300]}")
                last_err = RuntimeError(f"LLM 请求失败(可重试): {r.status_code} {r.text[:200]}")
        except (httpx.TimeoutException, httpx.ConnectError) as e:
            last_err = e

        if attempt < _RETRY_ATTEMPTS - 1:
            delay = _RETRY_BASE * (2 ** attempt)
            logger.warning("[llm] 第 {} 次重试 (延迟 {}s): {}", attempt + 1, delay, last_err)
            await asyncio.sleep(delay)
            _llm_runtime(invalidate=True)  # 重试前刷新配置（应对 key 轮换等）
            cfg = _cached_runtime
            headers["Authorization"] = f"Bearer {cfg['api_key']}" if cfg else headers["Authorization"]

    raise RuntimeError(f"LLM 请求超过最大重试次数: {last_err}") if last_err else RuntimeError("LLM 请求失败")


# ── FILE 块解析 ──────────────────────────────────────────────

_OPENER = re.compile(r"^---\s*FILE:\s*(.+?)\s*---\s*$", re.IGNORECASE)
_CLOSER = re.compile(r"^---\s*END\s+FILE\s*---\s*$", re.IGNORECASE)
_FENCE = re.compile(r"^\s{0,3}(```+|~~~+)")
_FRONTMATTER = re.compile(r"^---\s*\n([\s\S]*?)\n---\s*(?:\n|$)")
_WIKILINK = re.compile(r"\[\[([^\[\]\n]+?)\]\]")


def parse_file_blocks(text: str) -> list[dict]:
    """行级解析 LLM 输出的 FILE 块，带代码围栏追踪防误截断。"""
    blocks, lines = [], text.replace("\r\n", "\n").split("\n")
    i = 0
    while i < len(lines):
        m = _OPENER.match(lines[i])
        if not m:
            i += 1
            continue
        path, i = m.group(1).strip(), i + 1
        content, fence_ch, fence_len, closed = [], None, 0, False
        while i < len(lines):
            line = lines[i]
            fm = _FENCE.match(line)
            if fm:
                if fence_ch is None:
                    fence_ch, fence_len = fm.group(1)[0], len(fm.group(1))
                elif fm.group(1)[0] == fence_ch and len(fm.group(1)) >= fence_len:
                    fence_ch, fence_len = None, 0
                content.append(line); i += 1; continue
            if fence_ch is None and _CLOSER.match(line):
                closed = True; i += 1; break
            content.append(line); i += 1
        if closed and path:
            blocks.append({"path": path, "content": "\n".join(content)})
    return blocks


_REVIEW = re.compile(r"---REVIEW:\s*(\w[\w-]*)\s*\|\s*(.+?)\s*---\n([\s\S]*?)---END REVIEW---", re.IGNORECASE)


def parse_review_blocks(text: str) -> list[dict]:
    return [{"type": m.group(1).strip().lower() if m.group(1).strip().lower() in ("contradiction", "duplicate", "missing-page", "suggestion") else "confirm", "title": m.group(2).strip(), "body": m.group(3).strip()} for m in _REVIEW.finditer(text)]


# ── Prompt 模板 ──────────────────────────────────────────────


def build_analysis_prompt(purpose: str, index: str, source_content: str, filename: str) -> str:
    return f"""你是一个专业的研究分析师。阅读下面的来源文档，输出结构化分析，不要输出思考过程。
分析要求：关键实体（人物、组织、产品）、关键概念（理论、方法）、主要论点与发现、与现有 Wiki 的关联、矛盾与张力、建议（创建/更新哪些页面）。

**文件名：** {filename}

## 来源内容

{source_content[:50000]}

{f'## Wiki 目标\n{purpose}' if purpose else ''}{f'## 当前 Wiki 索引\n{index}' if index else ''}"""


def build_generation_prompt(schema: str, purpose: str, index: str, overview: str, filename: str, analysis: str) -> str:
    base = filename.rsplit(".", 1)[0]
    today = date.today().isoformat()
    return f"""你是一个 Wiki 维护者。基于分析结果生成 Wiki 文件，只输出 FILE 块，不要任何前言。

## 必须生成
1. **来源摘要** `wiki/sources/{base}.md`（必须此路径）
2. 实体页面 `wiki/entities/` 下
3. 概念页面 `wiki/concepts/` 下
4. 更新 `wiki/index.md`（保留已有条目）
5. 追加日志到 `wiki/log.md`（## [{today}] ingest | {filename}）
6. 更新 `wiki/overview.md`

## Frontmatter 规则
每页以 `---` 开始和结束。数组用 YAML 内联格式 `[a, b]`。必填字段：type（source|entity|concept|comparison|query|synthesis）、title、created、updated、tags、related（slug 数组）、sources（含 "{filename}"）。

## 输出格式
---FILE: wiki/xxx.md---
(含 frontmatter 的完整内容)
---END FILE---

## 严格要求
- 第一个字符必须是 `-`
- 所有内容使用中文
- 正文中用 [[wikilink]] 交叉引用

{f'## Wiki Schema\n{schema}' if schema else ''}{f'## Wiki 目标\n{purpose}' if purpose else ''}{f'## 当前 Wiki 索引\n{index}' if index else ''}{f'## 当前总览\n{overview}' if overview else ''}"""


# ── 两阶段 Ingest ────────────────────────────────────────────


class WikiIngestCanceled(Exception):
    """任务在阶段边界被用户取消。"""


def _update_job_stage(job_id: str | None, stage: str, progress_current: int) -> None:
    """在阶段边界更新 job，避免长任务失败时丢失定位信息。"""
    if job_id is None:
        return
    with get_session() as session:
        job = session.get(WikiIngestJob, job_id)
        if job is not None:
            job.stage = stage
            job.progress_current = progress_current


def _ensure_job_active(job_id: str | None) -> None:
    """取消请求在阶段边界生效，避免写入半成品页面。"""
    if job_id is None:
        return
    with get_session() as session:
        job = session.get(WikiIngestJob, job_id)
        if job is not None and job.status == "cancel_requested":
            job.status = "canceled"
            job.stage = "canceled"
            job.finished_at = datetime.now(timezone.utc)
            source = session.get(WikiSource, job.source_id)
            if source is not None:
                source.status = "pending"
                source.error_message = "任务已取消"
            raise WikiIngestCanceled("任务已取消")


async def auto_ingest(source_id: UUID | str, job_id: UUID | str | None = None) -> list[str]:
    """两阶段自动 Ingest：LLM 分析 → LLM 生成 Wiki 页面。"""
    source_key = str(source_id)
    job_key = str(job_id) if job_id is not None else None
    with get_session() as session:
        source = session.get(WikiSource, source_key)
        if source is None:
            raise ValueError(f"来源不存在: {source_id}")
        space = session.get(WikiSpace, source.space_id)
        pages = session.scalars(select(WikiPage).where(WikiPage.space_id == space.id)).all()
        index = _build_index(space, pages)
        overview = _build_overview(space, pages)
        schema = _build_schema()
        source.status = "analyzing"
        session.flush()

    try:
        # Step 1: LLM 分析
        _update_job_stage(job_key, "analyzing", 1)
        logger.info("[ingest] Step 1/2: 分析 {}", source.filename)
        analysis = await _llm_call(
            [{"role": "system", "content": build_analysis_prompt(space.description, index, source.content, source.filename)},
             {"role": "user", "content": f"分析文档：**{source.filename}**\n\n{source.content[:50000]}"}],
            max_tokens=4096,
        )

        # Step 2: LLM 生成
        _ensure_job_active(job_key)
        _update_job_stage(job_key, "generating", 2)
        with get_session() as session:
            session.get(WikiSource, source_key).status = "generating"
            session.flush()
        logger.info("[ingest] Step 2/2: 生成 Wiki 页面 {}", source.filename)
        generation = await _llm_call(
            [{"role": "system", "content": build_generation_prompt(schema, space.description, index, overview, source.filename, analysis)},
             {"role": "user", "content": f"为 **{source.filename}** 生成 Wiki 页面。"}],
            max_tokens=8192,
        )

        # 解析并写入
        _ensure_job_active(job_key)
        _update_job_stage(job_key, "writing", 3)
        blocks = parse_file_blocks(generation)
        logger.info("[ingest] 解析到 {} 个 FILE 块", len(blocks))
        written = await _write_blocks(source, blocks, job_id=job_key)
        with get_session() as session:
            src = session.get(WikiSource, source_key)
            src.status = "completed"
            src.page_count = len(written)
            session.flush()
        return written

    except WikiIngestCanceled:
        logger.info("[ingest] 已取消 {}", source.filename)
        raise
    except Exception as e:
        logger.exception("[ingest] 失败 {}", source.filename)
        with get_session() as session:
            src = session.get(WikiSource, source_key)
            src.status = "failed"
            src.error_message = str(e)[:500]
            session.flush()
        raise


def _frontmatter(content: str) -> str:
    """只解析开头 frontmatter，避免正文同名字段误命中。"""
    m = _FRONTMATTER.match(content.strip())
    return m.group(1) if m else content


def _field(content: str, field: str) -> str | None:
    m = re.search(rf"^{field}:\s*(.+?)$", _frontmatter(content), re.MULTILINE)
    return m.group(1).strip().strip("\"'") if m else None


def _list_field(content: str, field: str) -> list[str] | None:
    m = re.search(rf"^{field}:\s*\[(.*?)\]", _frontmatter(content), re.MULTILINE)
    if not m:
        return None
    return [x.strip().strip("\"'") for x in m.group(1).split(",") if x.strip()]


def _wikilink_titles(content: str) -> list[str]:
    """抽取 [[Page]] / [[Page|别名]] 中真实指向的页面标题。"""
    titles: list[str] = []
    for raw in _WIKILINK.findall(content):
        title = raw.split("|", 1)[0].split("#", 1)[0].strip()
        if title and title not in titles:
            titles.append(title)
    return titles


def _refresh_wikilinks(session, space_id, pages: list[WikiPage]) -> None:
    """按页面正文重建本次写入页面的 wikilink 出边。"""
    if not pages:
        return
    page_ids = [page.id for page in pages]
    session.execute(
        delete(WikiLink).where(
            WikiLink.space_id == space_id,
            WikiLink.source_page_id.in_(page_ids),
            WikiLink.relation_type == "wikilink",
        )
    )
    title_map = {
        page.title: page
        for page in session.scalars(select(WikiPage).where(WikiPage.space_id == space_id)).all()
    }
    for page in pages:
        for title in _wikilink_titles(page.content):
            target = title_map.get(title)
            if target is None or target.id == page.id:
                continue
            session.add(
                WikiLink(
                    space_id=space_id,
                    source_page_id=page.id,
                    target_page_id=target.id,
                    relation_type="wikilink",
                )
            )


async def _write_blocks(source: WikiSource, blocks: list[dict], job_id: str | None = None) -> list[str]:
    """将 FILE 块写入数据库 WikiPage。"""
    written = []
    written_pages: list[WikiPage] = []
    relation_keys: set[tuple[str, str, str]] = set()
    with get_session() as session:
        space = session.get(WikiSpace, source.space_id)
        source_in_session = session.get(WikiSource, source.id)
        for b in blocks:
            title = _field(b["content"], "title") or b["path"].split("/")[-1].replace(".md", "")
            page_type = _field(b["content"], "type") or "source"
            src_list = _list_field(b["content"], "sources") or [source.filename]
            existing = session.scalar(select(WikiPage).where(WikiPage.space_id == space.id, WikiPage.title == title))
            relation = "updated" if existing else "created"
            if existing:
                existing_meta = existing.metadata_ or {}
                existing_src = existing_meta.get("sources", [])
                if isinstance(existing_src, list):
                    for s in src_list:
                        if s not in existing_src:
                            existing_src.append(s)
                existing_meta["sources"] = existing_src
                existing.metadata_ = existing_meta
                existing.type = page_type
                existing.source = source.filename
                existing.content = b["content"]
                page = existing
            else:
                page = WikiPage(
                    space_id=space.id,
                    title=title,
                    content=b["content"],
                    type=page_type,
                    source=source.filename,
                    status="indexed",
                    metadata_={"sources": src_list, "source_path": b["path"]},
                )
                session.add(page)
            if page not in written_pages:
                written_pages.append(page)
            written.append(b["path"])
            session.flush()
            relation_key = (page.id, job_id or "", relation)
            if relation_key not in relation_keys and not _source_page_relation_exists(session, source.id, page.id, job_id, relation):
                relation_keys.add(relation_key)
                # 关系表是后续 review/lint/删除影响范围的可信追溯来源。
                session.add(
                    WikiSourcePage(
                        source_id=source.id,
                        page_id=page.id,
                        job_id=job_id,
                        relation=relation,
                    )
                )
        session.flush()
        if source_in_session is not None:
            source_in_session.page_count = len({page.id for page in written_pages})
        _refresh_wikilinks(session, space.id, written_pages)
    return written


def _source_page_relation_exists(session, source_id: str, page_id: str, job_id: str | None, relation: str) -> bool:
    return session.scalar(
        select(WikiSourcePage.id).where(
            WikiSourcePage.source_id == source_id,
            WikiSourcePage.page_id == page_id,
            WikiSourcePage.job_id == job_id,
            WikiSourcePage.relation == relation,
        )
    ) is not None


def _build_index(space: WikiSpace, pages: list[WikiPage]) -> str:
    labels = {"entity": "实体", "concept": "概念", "source": "来源", "synthesis": "综合", "comparison": "对比", "overview": "总览", "query": "查询", "other": "其他"}
    by_type: dict[str, list[WikiPage]] = {}
    for p in pages:
        by_type.setdefault(p.type or "other", []).append(p)
    lines = ["# Wiki 索引\n"]
    for pt, label in labels.items():
        items = by_type.get(pt, [])
        if items:
            lines.append(f"## {label}\n" + "\n".join(f"- [[{p.title}]]" + (f" ({', '.join((p.metadata_ or {}).get('sources', []))})" if (p.metadata_ or {}).get("sources") else "") for p in items) + "\n")
    return "\n".join(lines)


def _build_overview(space: WikiSpace, pages: list[WikiPage]) -> str:
    return f"# 知识总览\n\n**{space.name}** — {space.description}\n\n共 {len(pages)} 个页面，{source_count(pages)} 个来源\n"


def _build_schema() -> str:
    return """# Wiki Schema

## 页面类型
- **entity**: 实体（人物、组织、产品）
- **concept**: 概念（理论、方法、技术）
- **source**: 来源摘要
- **synthesis**: 跨来源综合分析
- **comparison**: 对比分析
- **overview**: 总览页面
- **query**: 查询结果存档

## Frontmatter 约定
所有页面必须包含：type, title, created, updated, tags, related, sources

## 交叉引用
正文中使用 [[PageName]] 语法。related 字段中使用 kebab-case slug。"""
