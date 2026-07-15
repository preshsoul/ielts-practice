/**
 * Input Sanitizer — higher-level sanitization for user inputs.
 *
 * Wraps and extends the low-level sanitizers in src/lib/security.js.
 * Referenced by CLAUDE.md (Section 3.1), DEPLOYMENT_CHECKLIST.md,
 * and scripts/test-security.mjs.
 */

import { cleanText, cleanEmail, cleanNumber, cleanList, cleanUrl } from "../lib/security.js";

const XSS_PATTERNS = [
  /<script[\s/>]/i,                          // <script> tags
  /javascript\s*:/i,                         // javascript: URLs
  /on\w+\s*=\s*["']?/i,                      // inline event handlers (onclick, onerror, etc.)
  /eval\s*\(/i,                              // eval() calls
  /expression\s*\(/i,                        // CSS expression()
  /<iframe[\s/>]/i,                          // <iframe> injection
  /<object[\s/>]/i,                          // <object> injection
  /<embed[\s/>]/i,                           // <embed> injection
  /<link[\s/>]/i,                            // <link> injection
  /<meta[\s/>]/i,                            // <meta> injection
  /data\s*:\s*text\/html/i,                  // data: URLs with HTML
  /vbscript\s*:/i,                           // vbscript: URLs
];

/**
 * Check if a string value contains suspicious XSS patterns.
 * @param {string} value - The value to check
 * @returns {boolean} true if suspicious patterns detected
 */
export function containsSuspiciousPatterns(value) {
  const text = String(value || "");
  return XSS_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * Sanitize HTML content by stripping all tags and dangerous patterns.
 * For rich-text HTML, use a proper sanitizer like DOMPurify.
 * This function strips ALL tags — it is not a rich-text whitelist.
 * @param {string} value - The HTML string to sanitize
 * @param {{ maxLength?: number }} opts
 * @returns {string} sanitized plain text
 */
export function sanitizeHtml(value, { maxLength = 5000 } = {}) {
  return cleanText(value, { maxLength, allowNewlines: true });
}

/**
 * Sanitize an email address.
 * @param {string} value
 * @returns {string} sanitized email or empty string
 */
export function sanitizeEmail(value) {
  return cleanEmail(value);
}

/**
 * Sanitize plain text (strips control chars, tags, trims).
 * @param {string} value
 * @param {{ maxLength?: number, allowNewlines?: boolean }} opts
 * @returns {string}
 */
export function sanitizeText(value, opts) {
  return cleanText(value, opts);
}

/**
 * Sanitize a numeric value with bounds checking.
 * @param {*} value
 * @param {{ min?: number, max?: number, integer?: boolean }} opts
 * @returns {number | null}
 */
export function sanitizeNumber(value, opts) {
  return cleanNumber(value, opts);
}

/**
 * Sanitize a list of strings.
 * @param {*} value - Array or comma-separated string
 * @param {{ maxItems?: number, maxLength?: number }} opts
 * @returns {string[]}
 */
export function sanitizeList(value, opts) {
  return cleanList(value, opts);
}

/**
 * Sanitize a URL.
 * @param {string} value
 * @returns {string} sanitized URL or empty string
 */
export function sanitizeUrl(value) {
  return cleanUrl(value);
}

/**
 * Full input sanitization — checks for suspicious patterns AND cleans text.
 * Returns the sanitized value and a flag indicating if suspicious content was found.
 * @param {string} value
 * @param {{ maxLength?: number }} opts
 * @returns {{ sanitized: string, suspicious: boolean }}
 */
export function sanitizeAndFlag(value, { maxLength = 256 } = {}) {
  const suspicious = containsSuspiciousPatterns(value);
  const sanitized = cleanText(value, { maxLength });
  return { sanitized, suspicious };
}

// Default export as a class for backward compatibility with test-security.mjs
const InputSanitizer = {
  sanitizeText,
  sanitizeEmail,
  sanitizeNumber,
  sanitizeList,
  sanitizeUrl,
  sanitizeHtml,
  containsSuspiciousPatterns,
  sanitizeAndFlag,
};

export default InputSanitizer;
