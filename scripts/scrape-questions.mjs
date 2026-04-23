import { fetchWithRateLimit } from "./lib/question-scraper/fetcher.js";
import { extractTopicCandidates } from "./lib/question-scraper/extractor.js";
import { generateQuestionDrafts } from "./lib/question-scraper/generator.js";
import { validateQuestionSet } from "./lib/question-scraper/validator.js";
import { writeReviewQueue } from "./lib/question-scraper/writer.js";
import { QUESTION_SOURCES } from "./lib/question-scraper/sources.js";

const dryRun = process.argv.includes("--dry-run");

function uniq(values) {
  return [...new Set(values.filter(Boolean).map((item) => String(item).trim()).filter(Boolean))];
}

async function collectTopics(source) {
  const html = await fetchWithRateLimit(source.url, { rateLimitMs: source.rateLimitMs });
  if (!html) {
    return source.fallbackTopics || [];
  }
  const extracted = extractTopicCandidates(html);
  const candidates = uniq([
    ...(extracted.topics || []),
    ...(source.fallbackTopics || []),
  ]);
  return candidates.slice(0, 8);
}

async function main() {
  const topicsBySource = [];
  for (const source of QUESTION_SOURCES) {
    const topics = await collectTopics(source);
    if (topics.length) {
      topicsBySource.push({ source, topics });
    }
  }

  const generated = { passages: {}, questions: [] };
  topicsBySource.forEach(({ source, topics }, index) => {
    const draft = generateQuestionDrafts({ topics, sourceId: source.id, startIndex: index * 100 + 1 });
    generated.questions.push(...draft.questions);
    Object.assign(generated.passages, draft.passages);
  });

  const validation = validateQuestionSet(generated.questions);
  const validQuestions = validation.valid;
  const invalidQuestions = validation.invalid;

  console.log(`Collected ${generated.questions.length} question drafts from ${topicsBySource.length} sources.`);
  console.log(`Valid drafts: ${validQuestions.length}`);
  console.log(`Invalid drafts: ${invalidQuestions.length}`);

  if (dryRun) {
    return;
  }

  const result = await writeReviewQueue({ questions: validQuestions, passages: generated.passages }, { version: "1.1.0" });
  console.log(`Wrote ${result.questions.length} review questions and ${Object.keys(result.passages).length} review passages.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
