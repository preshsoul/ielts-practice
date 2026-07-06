/**
 * IELTS Reading passage generation prompts and CEFR mapping tables.
 *
 * These prompts are designed for Claude (primary) and DeepSeek (fallback).
 * The system prompt is trusted (not user-supplied). User topics are passed
 * through buildHardenedPrompt() before interpolation.
 */

// ── CEFR to IELTS band mapping ──────────────────────────────────────────────

export const BAND_TO_CEFR: Record<string, string> = {
  "4.0": "A2",
  "4.5": "A2",
  "5.0": "B1",
  "5.5": "B1",
  "6.0": "B2",
  "6.5": "B2",
  "7.0": "C1",
  "7.5": "C1",
  "8.0": "C1",
  "8.5": "C2",
  "9.0": "C2",
};

// ── CEFR difficulty guidance (injected into the prompt) ─────────────────────

export const CEFR_GUIDANCE: Record<string, string> = {
  A2: `- Vocabulary: common everyday words, basic academic terms (e.g., "increase", "important", "develop")
- Sentence structure: mostly simple and compound sentences, few complex structures
- Paragraph structure: short paragraphs (3-5 sentences), clear topic sentences
- Text organisation: simple chronological or thematic organisation, predictable structure
- Argument complexity: straightforward factual statements, minimal inference required`,
  B1: `- Vocabulary: familiar academic words, some less common terms with context clues provided
- Sentence structure: mix of simple, compound, and some complex sentences with basic subordinating conjunctions
- Paragraph structure: moderate paragraphs (4-7 sentences), clear topic sentences with supporting details
- Text organisation: clear logical structure, may include compare/contrast or cause/effect
- Argument complexity: explicit arguments with supporting evidence, some implicit information`,
  B2: `- Vocabulary: academic and topic-specific vocabulary, some idiomatic expressions
- Sentence structure: frequent complex sentences with subordination, relative clauses, and conditionals
- Paragraph structure: developed paragraphs with topic sentences, elaboration, examples, and transitions
- Text organisation: varied discourse patterns (problem/solution, argument/counter-argument)
- Argument complexity: abstract ideas, implied meanings, writer stance and hedging`,
  C1: `- Vocabulary: wide range of academic vocabulary, nuanced word choice, collocations
- Sentence structure: varied sentence patterns including inversion, cleft sentences, nominalisation
- Paragraph structure: sophisticated paragraph development with embedded reasoning
- Text organisation: complex discourse structures, multiple viewpoints, subtle transitions
- Argument complexity: abstract theoretical concepts, subtle distinctions, indirect references`,
  C2: `- Vocabulary: extensive academic and specialised vocabulary, precise lexical choices
- Sentence structure: masterful variety of sentence structures for rhetorical effect
- Paragraph structure: dense, multi-layered paragraphs with sophisticated internal logic
- Text organisation: highly complex organisational patterns, embedded arguments
- Argument complexity: highly abstract and nuanced, multiple competing interpretations`,
};

// ── Topic lists (for reference, not injected into every prompt) ─────────────

export const ACADEMIC_TOPICS = [
  "Science & Technology",
  "Environment & Climate Change",
  "Education & Learning",
  "Health & Medicine",
  "Urban Development & Architecture",
  "Economics & Business",
  "Culture & Society",
  "History & Archaeology",
  "Psychology & Behavior",
  "Communication & Media",
  "Transport & Infrastructure",
  "Food & Agriculture",
  "Energy & Resources",
  "Art & Literature",
  "Space Exploration",
];

export const GENERAL_TOPICS = [
  "Work & Employment",
  "Travel & Tourism",
  "Hobbies & Leisure",
  "Family & Relationships",
  "Food & Nutrition",
  "Sports & Exercise",
  "Shopping & Consumer Behavior",
  "Transport & Commuting",
  "Technology in Daily Life",
  "Health & Fitness",
  "Education & Career",
  "Environment & Recycling",
  "Community & Volunteering",
  "Entertainment & Media",
  "Housing & Living",
];

// ── System prompt builder ────────────────────────────────────────────────────

export function buildSystemPrompt(
  targetBand: number,
  passageType: string,
  questionTypes: string[],
  cefrLevel: string,
): string {
  const guidance = CEFR_GUIDANCE[cefrLevel] || CEFR_GUIDANCE["B2"];
  const typeLabel = passageType === "academic" ? "Academic" : "General Training";
  const wordRange = passageType === "academic" ? "700-950 words" : "600-800 words";
  const register = passageType === "academic"
    ? "formal academic register with appropriate hedging and citation conventions"
    : "semi-formal register suitable for a general audience, accessible but not conversational";

  const qtDescriptions: Record<string, string> = {
    tfng: `- tfng: True/False/Not Given statements. 3-4 questions. Statements must require careful distinction between False (contradicted by the passage) and Not Given (not mentioned). Include at least one of each type across the set. Options must be exactly ["True", "False", "Not Given"].`,
    mcq: `- mcq: Multiple choice questions. 3-4 questions. Each question has exactly 4 options (A-D). Only one option is correct. Distractors must be plausible but clearly wrong based on the passage.`,
    summary: `- summary: Summary completion with a word bank. 3-4 questions. Provide a summary paragraph with numbered gaps and a word bank of 5-7 words/phrases (including distractors). The options array is the word bank; the answer is the correct word/phrase.`,
    matching: `- matching: Matching headings to paragraphs. 3-4 questions. Provide a list of headings and ask which paragraph each belongs to. Options are the heading choices; the answer identifies the correct heading for each question.`,
  };

  const qtSections = questionTypes
    .map((qt) => qtDescriptions[qt] || "")
    .filter(Boolean)
    .join("\n");

  return `You are an IELTS Reading passage generator calibrated to official IELTS band descriptors. You must generate a reading passage and question set that matches the requested IELTS band level and CEFR equivalent.

## CEFR / IELTS Calibration
Target Band: ${targetBand}
CEFR Level: ${cefrLevel}
Passage Type: ${typeLabel}

## CEFR Language Guidance (${cefrLevel})
${guidance}

## Passage Requirements
- Type: ${typeLabel} (${wordRange} words)
- Register: ${register}
- Content: Informative, well-structured, suitable for testing reading comprehension at Band ${targetBand}
- Structure: Clear introduction, logically organised body paragraphs, and a conclusion or closing paragraph
- Paragraphs: 4-6 clearly delineated paragraphs (label them "Paragraph A", "Paragraph B", etc. for matching questions)

## Question Requirements
Generate exactly 13-14 questions total, distributed across the requested types:
${qtSections}

## Output Format
Return ONLY valid JSON (no markdown fences, no commentary):

{
  "passage": {
    "title": "string (descriptive, academic style)",
    "body": "string (the full passage text with paragraphs labelled A, B, C, etc.)",
    "topic": "string (broad topic category, e.g. 'Environmental Science')",
    "wordCount": number,
    "cefrLevel": "${cefrLevel}"
  },
  "questions": [
    {
      "type": "tfng|mcq|summary|matching",
      "questionText": "string (the question or statement)",
      "options": ["array", "of", "option", "strings"],
      "answer": "string (must exactly match one option for mcq/tfng/summary, or be the correct heading for matching)",
      "explanation": "string (explain why the answer is correct, citing specific evidence from the passage)",
      "difficulty": number (1=easiest, 2=moderate, 3=hardest, relative to Band ${targetBand}),
      "section": "string (e.g. 'Reading - T/F/NG', 'Reading - Multiple Choice', 'Reading - Summary', 'Reading - Matching')"
    }
  ]
}

## Critical Rules
1. Every question MUST have a clear, unambiguous textual basis in the passage
2. For TF/NG questions: "False" means the passage directly contradicts the statement; "Not Given" means the passage does not address it
3. For MCQ questions: exactly 4 options, exactly 1 correct answer
4. For summary questions: the word bank (options array) must have 5-7 entries including 1-2 distractors
5. Each explanation must cite specific paragraph references or line evidence
6. Do NOT include markdown formatting, code fences, or any text outside the JSON object
7. The passage must be original content, not copied from existing IELTS materials`;
}

// ── User instruction builder ─────────────────────────────────────────────────

export function buildInstructions(
  targetBand: number,
  passageType: string,
  questionTypes: string[],
  topic: string | null,
): string {
  const typeLabel = passageType === "academic" ? "Academic" : "General Training";
  const qtLabels: Record<string, string> = {
    tfng: "True/False/Not Given",
    mcq: "Multiple Choice",
    summary: "Summary Completion",
    matching: "Matching Headings",
  };

  const qtList = questionTypes.map((qt) => qtLabels[qt] || qt).join(", ");

  let topicLine = "Topic: Choose any appropriate topic for this band level.";
  if (topic) {
    topicLine = `Topic: The user has requested the following topic (delimited below as untrusted user input). Incorporate this topic naturally into the passage.`;
  }

  return `${topicLine}

Target Band: ${targetBand}
Passage Type: ${typeLabel}
Question Types: ${qtList}

Generate an original IELTS Reading passage with 13-14 questions distributed across the requested types.
Return ONLY valid JSON — no markdown, no commentary, no code fences.`;
}
