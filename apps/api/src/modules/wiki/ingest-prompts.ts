/** OKF 生成提示词。存储层只接受标准 Concept 文档，不接受自定义文件块协议。 */

export function buildSystemPrompt(purpose: string, schema: string): string {
  return `You are an Open Knowledge Format (OKF) v0.1 curator.

## Purpose
${purpose || "No additional purpose was provided."}

## Local guidance
${schema || "Use descriptive, self-explanatory type values."}

## OKF rules
- Every generated document is a UTF-8 Markdown Concept document.
- Every document must have YAML frontmatter with a non-empty type.
- Prefer the frontmatter fields type, title, description, resource, tags, and timestamp.
- Use standard Markdown links such as [Orders](/tables/orders.md) for concept relationships.
- Use # Schema, # Examples, and # Citations sections when they apply.
- Never use wiki-link syntax, HTML-only links, or reserved index.md/log.md as generated concepts.
- Unknown type values are valid; choose precise descriptive types.
- All titles, descriptions, tags, and body content must be written in Chinese.`;
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
  return `Generate OKF v0.1 Concept documents from the analysis below.

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
        "timestamp": "${new Date().toISOString()}",
        "provenance": ["${sourceIdentity}"]
      },
      "content": "Markdown body with standard links such as [Concept](/concepts/concept.md)."
    }
  ]
}

Rules:
1. Paths are relative to the OKF bundle root and must end in .md.
2. Do not generate index.md or log.md; the application maintains them.
3. Every frontmatter object must contain a non-empty type.
4. Create a reference document for the source and only substantive entity/concept documents.
5. Link to existing concepts by their exact concept ID with normal Markdown links.
6. Include # Citations with numbered Markdown links when claims rely on external sources.
7. Do not wrap the JSON in a Markdown code fence.`;
}
