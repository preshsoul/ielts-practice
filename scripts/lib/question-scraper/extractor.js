function stripTags(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeEntities(text) {
  return String(text || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#8211;|&ndash;/g, "–")
    .replace(/&#8212;|&mdash;/g, "—")
    .replace(/&#038;|&#38;/g, "&");
}

const STOP_PHRASES = [
  "cookie",
  "privacy",
  "sign in",
  "signin",
  "subscribe",
  "menu",
  "search",
  "contact",
  "home",
  "footer",
  "navigation",
  "faq",
  "terms",
  "advertise",
  "newsletter",
  "login",
  "register",
  "skip to content",
  "questions",
  "topics",
  "topic",
  "speaking",
  "ielts",
  "part 1",
  "lesson",
  "lessons",
  "recent",
  "new lessons",
  "store",
  "about me",
  "blog",
  "guide",
  "common questions",
  "test info",
  "test information",
  "click",
  "click here",
  "click below",
  "copyright",
  "copyright notice",
  "resources",
  "useful links",
  "disclaimer",
  "happy new year",
  "notice",
  "learn more",
];

function extractScopedContent(html) {
  const bodyMatch = String(html || "").match(/<(main|article|body)\b[^>]*>([\s\S]*?)<\/\1>/i);
  return bodyMatch ? bodyMatch[2] : String(html || "");
}

export function extractTitle(html) {
  const match = String(html || "").match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? decodeEntities(stripTags(match[1])) : "";
}

function normalizeCandidate(text) {
  return decodeEntities(stripTags(text))
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();
}

function isUsefulTopic(text) {
  const value = normalizeCandidate(text);
  if (!value) return false;
  if (value.length < 4 || value.length > 120) return false;
  const lower = value.toLowerCase();
  if (/[?]/.test(lower)) return false;
  if (STOP_PHRASES.some((phrase) => lower.includes(phrase))) return false;
  const words = lower.split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 12) return false;
  if (/\b(19|20)\d{2}\b/.test(lower)) return false;
  if (/^(how|what|why|when|where|who|which|is|are|do|does|can|could|should|would|will)\b/.test(lower)) return false;
  const stopWordCount = words.filter((word) => ["and", "or", "the", "a", "an", "of", "to", "in", "for"].includes(word)).length;
  if (stopWordCount >= Math.max(2, Math.floor(words.length / 2))) return false;
  return true;
}

function dedupeText(values) {
  return [...new Set(values.map((value) => normalizeCandidate(value)).filter(Boolean))];
}

export function extractListItems(html) {
  const items = [];
  const scoped = extractScopedContent(html);
  for (const match of String(scoped || "").matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)) {
    const text = normalizeCandidate(match[1]);
    const words = text.split(/\s+/).length;
    const boilerplate = STOP_PHRASES.some((phrase) => text.toLowerCase().includes(phrase));
    if (text.length >= 18 && text.length <= 220 && words >= 3 && !boilerplate && isUsefulTopic(text)) {
      items.push(text);
    }
  }
  return dedupeText(items);
}

export function extractParagraphs(html) {
  const paragraphs = [];
  const scoped = extractScopedContent(html);
  for (const match of String(scoped || "").matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)) {
    const text = normalizeCandidate(match[1]);
    const boilerplate = /(cookie|privacy|subscribe|login|sign up|copyright|all rights reserved)/i.test(text);
    if (text.length >= 40 && !boilerplate) paragraphs.push(text);
  }
  return dedupeText(paragraphs);
}

export function extractHeadings(html) {
  const scoped = extractScopedContent(html);
  const headings = [];
  for (const match of String(scoped || "").matchAll(/<(h1|h2|h3|h4)\b[^>]*>([\s\S]*?)<\/\1>/gi)) {
    const text = normalizeCandidate(match[2]);
    if (isUsefulTopic(text)) headings.push(text);
  }
  return dedupeText(headings);
}

export function extractTopicCandidates(html) {
  const title = extractTitle(html);
  const headings = extractHeadings(html);
  const listItems = extractListItems(html);
  const paragraphs = extractParagraphs(html);
  const titleCandidate = isUsefulTopic(title) ? [normalizeCandidate(title)] : [];
  const candidateTopics = dedupeText([...titleCandidate, ...headings, ...listItems]);
  return {
    title,
    topics: candidateTopics.slice(0, 40),
    snippets: paragraphs.slice(0, 8),
  };
}
