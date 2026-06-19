/**
 * LLM 提示词，用于两阶段 Wiki 导入流水线。
 *
 * 阶段一（分析）：LLM 读取源内容 + 上下文，输出结构化分析结果。
 * 阶段二（生成）：LLM 读取分析结果，输出 FILE 块用于创建页面。
 */

// ─── 阶段零：系统提示词 ───────────────────────────────────────────

export function buildSystemPrompt(purpose: string, schema: string): string {
  return `You are a wiki knowledge curator. Your job is to analyze source documents and maintain a structured wiki.

## Wiki Purpose
${purpose || "Not specified."}

## Page Type Schema
${
  schema ||
  `Four types: entity (people, orgs, products), concept (ideas, methods),
source (document summaries), overview (global summary).`
}

## Rules
- Entity pages: people, organizations, products, tools, named things
- Concept pages: theories, methods, techniques, phenomena, abstract ideas
- Source pages: summaries of ingested documents (auto-managed)
- Use [[wikilink]] to cross-reference related pages
- Frontmatter fields: type, title, created, updated, tags, sources, related
- Only create entity/concept pages for genuinely important content
- Do NOT create trivial or speculative pages
- All page titles, tags, and content must be written in Chinese`;
}

// ─── 阶段一：分析提示词 ────────────────────────────────────────────

export function buildAnalysisPrompt(sourceContent: string, existingIndex: string): string {
  return `Analyze the following source document and provide a structured analysis.

## Existing Wiki Index
The wiki currently has these pages:
${existingIndex || "(empty wiki)"}

## Source Document
${sourceContent}

## Task
Analyze the source document and return a JSON object with these fields:
1. "keyEntities": Array of {name, description, type} — important named entities found in the source (people, organizations, products, tools). type is always "entity".
2. "keyConcepts": Array of {name, description, type} — important concepts, theories, or ideas. type is always "concept".
3. "mainArguments": Array of strings — the main arguments or findings presented.
4. "connections": Array of strings — how this connects to existing wiki pages. Use format "relates to [[page-slug]]: explanation".
5. "summary": A 2-3 sentence summary of this source for the global overview.

Focus on substantive content. Ignore minor details, formatting, and references sections.`;
}

// ─── 阶段二：生成提示词 ────────────────────────────────────────────

export function buildGenerationPrompt(
  analysis: string,
  existingSlugs: string[],
  sourceIdentity: string,
): string {
  const slugList = existingSlugs.length > 0 ? existingSlugs.join(", ") : "(empty)";

  return `Based on the analysis below, generate wiki pages as FILE blocks. All wiki page titles and content must be in Chinese.

## Existing Page Slugs
${slugList}

## Analysis
${analysis}

## Source Identity (for frontmatter sources field)
${sourceIdentity}

## Task
Generate wiki pages using this FILE block format:

---FILE: wiki/concepts/example.md---
---
type: concept
title: Example Title
created: ${new Date().toISOString().slice(0, 10)}
updated: ${new Date().toISOString().slice(0, 10)}
tags: [tag1, tag2]
sources: [${sourceIdentity}]
related: []
---

Content here with [[wikilink]] references.
---END FILE---

Rules:
1. Create one source summary page at wiki/sources/<source-stem>.md
2. Create entity pages for important named entities (wiki/entities/<slug>.md)
3. Create concept pages for important concepts (wiki/concepts/<slug>.md)
4. Use [[wikilink]] to reference existing pages from the slug list
5. Frontmatter must include: type, title, created, updated, tags, sources, related
6. sources array must include "${sourceIdentity}"
7. related should reference existing related pages via their slugs
8. Content should be informative and well-structured with markdown
9. Format as separate ---FILE: path--- ... ---END FILE--- blocks
10. Do NOT generate pages for trivial or speculative content`;
}
