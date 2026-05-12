import {
  cleanEmail,
  cleanList,
  cleanNumber,
  cleanText,
  cleanUrl,
} from "../lib/security.js";

class InputSanitizer {
  static sanitizeText(input) {
    return cleanText(input, { maxLength: 4000, allowNewlines: false });
  }

  static sanitizeHtml(input, allowedTags = []) {
    const text = cleanText(input, { maxLength: 4000, allowNewlines: true });
    if (!allowedTags.length) return text;
    return text;
  }

  static sanitizeEmail(email) {
    return cleanEmail(email);
  }

  static sanitizeNumber(input, min = -Infinity, max = Infinity) {
    return cleanNumber(input, { min, max });
  }

  static sanitizeFilename(filename) {
    const text = cleanText(filename, { maxLength: 255 });
    return text.replace(/[^a-zA-Z0-9._-]/g, "_") || "file";
  }

  static sanitizeUrl(url) {
    return cleanUrl(url);
  }

  static sanitizeList(value, maxItems = 25) {
    return cleanList(value, { maxItems });
  }

  static containsSuspiciousPatterns(input) {
    if (typeof input !== "string") return false;
    const suspiciousPatterns = [
      /<script/i,
      /javascript:/i,
      /on\w+\s*=/i,
      /data:\s*text\/html/i,
      /vbscript:/i,
      /expression\s*\(/i,
      /eval\s*\(/i,
    ];
    return suspiciousPatterns.some((pattern) => pattern.test(input));
  }

  static validateLength(input, min = 0, max = 10000) {
    if (typeof input !== "string") return false;
    const length = input.length;
    return length >= min && length <= max;
  }
}

export default InputSanitizer;
