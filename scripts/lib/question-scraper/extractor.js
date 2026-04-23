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

function extractScopedContent(html) {
  const bodyMatch = String(html || "").match(/<(main|article|body)\b[^>]*>([\s\S]*?)<\/\1>/i);
  return bodyMatch ? bodyMatch[2] : String(html || "");
}

export function extractTitle(html) {
  const match = String(html || "").match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? stripTags(match[1]) : "";
}

export function extractListItems(html) {
  const items = [];
  const scoped = extractScopedContent(html);
  for (const match of String(scoped || "").matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)) {
    const text = stripTags(match[1]);
    const words = text.split(/\s+/).length;
    const boilerplate = /(cookie|privacy|signin|sign in|subscribe|menu|search|contact|home|footer|navigation)/i.test(text);
    if (text.length >= 18 && text.length <= 300 && words >= 3 && !boilerplate) {
      items.push(text);
    }
  }
  return [...new Set(items)];
}

export function extractParagraphs(html) {
  const paragraphs = [];
  const scoped = extractScopedContent(html);
  for (const match of String(scoped || "").matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)) {
    const text = stripTags(match[1]);
    const boilerplate = /(cookie|privacy|subscribe|login|sign up|copyright|all rights reserved)/i.test(text);
    if (text.length >= 40 && !boilerplate) paragraphs.push(text);
  }
  return paragraphs;
}

export function extractTopicCandidates(html) {
  const title = extractTitle(html);
  const listItems = extractListItems(html);
  const paragraphs = extractParagraphs(html);
  return {
    title,
    topics: listItems.slice(0, 40),
    snippets: paragraphs.slice(0, 8),
  };
}
