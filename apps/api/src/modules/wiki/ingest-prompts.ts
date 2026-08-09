/** OKF 生成提示词。存储层只接受标准 Concept 文档，不接受自定义文件块协议。 */

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
  "summary": "A concise bundle overview update."
}

Focus on durable, source-backed knowledge. Do not create trivial or speculative concepts.`;
}

export function buildGenerationPrompt(
  analysis: string,
  existingConceptIds: string[],
  sourceIdentity: string,
): string {
  const concepts = existingConceptIds.length > 0 ? existingConceptIds.join(", ") : "(empty bundle)";
  return `Generate OKF v0.2 Concept documents from the analysis below.

## Existing concept IDs
${concepts}

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
      "content": "Markdown body with standard links such as [Concept](/concepts/concept.md) and per-claim footnotes such as [^src]."
    }
  ]
}

Rules:
1. Paths are relative to the OKF bundle root and must end in .md.
2. Do not generate index.md or log.md; the application maintains them.
3. Every frontmatter object must contain a non-empty type.
4. Create a reference document for the source and only substantive entity/concept documents.
5. Link to existing concepts by their exact concept ID with normal Markdown links.
6. List derivation sources in the frontmatter sources field and cite per-claim with markdown footnotes keyed to a sources[].id (for example [^policy]); do not emit a # Citations section.
7. Do not wrap the JSON in a Markdown code fence.
8. Titles and body content must be written in Chinese except for proper nouns or English-first terms; when English is used, add a parenthetical Chinese translation.
9. Every frontmatter type must be one of: ${WIKI_CONCEPT_TYPES.join(", ")}. Choose the knowledge form that best matches the concept; fall back to Concept when unsure.`;
}
