export function toText(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

export function toList(value) {
  if (Array.isArray(value)) return value.map(toText).filter(Boolean);
  if (typeof value === "string") return value.split(",").map((item) => item.trim()).filter(Boolean);
  return [];
}

export function unique(values) {
  return [...new Set((Array.isArray(values) ? values : []).filter(Boolean))];
}
