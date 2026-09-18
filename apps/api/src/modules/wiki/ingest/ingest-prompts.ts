/** OKF 生成提示词。存储层只接受标准 Concept 文档，不接受自定义文件块协议。 */

import type { ConceptHandle } from "@feedmind/wiki-core";
import { WIKI_CONCEPT_TYPES } from "@feedmind/contracts";

export function buildSystemPrompt(purpose: string, schema: string): string {
  return `You are an Open Knowledge Format (OKF) v0.2 curator.

## Purpose
${purpose || "No additional purpose was provided."}

## Local guidance
${schema || "Use descriptive, self-explanatory type values."}

## OKF rules
- Every generated document is a UTF-8 Markdown Concept document.
- Every document must have YAML frontmatter with a non-empty type.
- Prefer the frontmatter fields type, title, description, resource, tags, generated, sources, and status.
- Record provenance in the sources frontmatter field; each entry's resource points at the material the concept derives from.
- Attribute per-claim claims with markdown footnotes keyed to a sources[].id (for example [^policy]); never emit a # Citations body section.
- Use standard Markdown links such as [Orders](/tables/orders.md) for concept relationships.
- Use # Schema, # Examples, and # Computation sections when they apply.
- Never use wiki-link syntax, HTML-only links, or reserved index.md/log.md as generated concepts.
- Unknown type values are valid; choose precise descriptive types.
- All titles, descriptions, tags, and body content must be written in Chinese, except for proper nouns (e.g., instrument abbreviations like ECS/GEM/FLS, chemical formulas, product names) or terms more commonly used in English (e.g., API, D-T, PDF).
- When an English term is used, add a natural Chinese translation in parentheses that fits the Chinese context and conventions.
- Use only one of these allowed type values for the frontmatter type field: ${WIKI_CONCEPT_TYPES.join(", ")}. Pick the knowledge form that best matches the concept; if none fits, use Concept.`;
}

export function buildAnalysisPrompt(sourceContent: string, existingIndex: string): string {
  return `Analyze the following source document for an OKF knowledge bundle.

## Existing bundle index
${existingIndex || "(empty bundle)"}

## Source document
${sourceContent}

## Return JSON
{
  "keyEntities": [{"name": "...", "description": "...", "type": "..."}],
  "keyConcepts": [{"name": "...", "description": "...", "type": "..."}],
  "mainArguments": ["..."],
  "connections": ["Describe relationships using normal Markdown paths."],
  "summary": "A concise bundle summary."
}

Focus on durable, source-backed knowledge. Do not create trivial or speculative concepts.`;
}

export function buildGenerationPrompt(options: {
  analysis: string;
  sourceIdentity: string;
  handleTable: ConceptHandle[];
  mergeHints: string[];
}): string {
  const { analysis, sourceIdentity, handleTable, mergeHints } = options;
  // 句柄表：模型只操作 ref-N，系统在落盘前翻译回真实路径——防止长路径/中文 ID 被抄错
  const handles =
    handleTable.length > 0
      ? handleTable
          .map(
            (h) =>
              `${h.ref} = ${h.id} — ${h.title} — ${h.type} — ${h.description || "(no description)"}`,
          )
          .join("\n")
      : "(empty bundle)";
  const hints =
    mergeHints.length > 0 ? mergeHints.join("\n") : "(no analysis items; create as needed)";
  return `Generate OKF v0.2 Concept documents from the analysis below.

## Existing concepts (handles)
Each line maps a short handle to a real concept. Use the handle in "path" and in content links — the system translates handles to real paths.
${handles}

## Dedup guidance (from analysis)
${hints}

## Source identity
${sourceIdentity}

## Analysis
${analysis}

## Return exactly one JSON object
{
  "documents": [
    {
      "path": "references/source-summary.md",
      "frontmatter": {
        "type": "Reference",
        "title": "...",
        "description": "One sentence summary.",
        "tags": ["..."],
        "sources": [
          { "id": "src", "resource": "${sourceIdentity}", "title": "导入的源文档" }
        ]
      },
      "content": "Markdown body with standard links such as [Concept](ref-1) and per-claim footnotes such as [^src]."
    }
  ]
}

Rules:
1. To UPDATE an existing concept, set "path" to its handle (e.g. "ref-1"). Do not invent a new path for it.
2. To CREATE a new concept, set "path" to a new relative path like "concepts/foo.md" (must end in .md).
3. In content, link to existing concepts as [标题](ref-1). Do not write full concept IDs in links.
4. Do not generate index.md or log.md; the application maintains them.
5. Every frontmatter object must contain a non-empty type.
6. Create a reference document for the source and only substantive entity/concept documents.
7. List derivation sources in the frontmatter sources field and cite per-claim with markdown footnotes keyed to a sources[].id (for example [^policy]); do not emit a # Citations section.
8. Do not wrap the JSON in a Markdown code fence.
9. Titles and body content must be written in Chinese except for proper nouns or English-first terms; when English is used, add a parenthetical Chinese translation.
10. Every frontmatter type must be one of: ${WIKI_CONCEPT_TYPES.join(", ")}. Choose the knowledge form that best matches the concept; fall back to Concept when unsure.`;
}
