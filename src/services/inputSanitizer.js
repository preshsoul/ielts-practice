// XSS protection and input sanitization utilities
import DOMPurify from 'dompurify';

// Configure DOMPurify for strict sanitization
const purifyConfig = {
  ALLOWED_TAGS: [], // No HTML tags allowed
  ALLOWED_ATTR: [], // No attributes allowed
  ALLOW_DATA_ATTR: false,
  FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'button'],
  FORBID_ATTR: ['onclick', 'onload', 'onerror', 'onmouseover', 'style', 'href'],
};

function stripTags(input) {
  return input
    .replace(/<\/?[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function canUseDomPurify() {
  return DOMPurify && typeof DOMPurify.sanitize === 'function';
}

class InputSanitizer {
  // Sanitize text input (removes HTML/script content)
  static sanitizeText(input) {
    if (typeof input !== 'string') return '';
    if (canUseDomPurify()) {
      return DOMPurify.sanitize(input, purifyConfig).trim();
    }
    return stripTags(input);
  }

  // Sanitize HTML content (allows limited safe tags for rich text)
  static sanitizeHtml(input, allowedTags = ['p', 'br', 'strong', 'em', 'u']) {
    if (typeof input !== 'string') return '';
    if (!canUseDomPurify()) {
      return stripTags(input);
    }
    const htmlConfig = {
      ALLOWED_TAGS: allowedTags,
      ALLOWED_ATTR: [],
      FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form'],
      FORBID_ATTR: ['onclick', 'onload', 'onerror', 'onmouseover', 'style', 'href'],
    };
    return DOMPurify.sanitize(input, htmlConfig);
  }

  // Validate and sanitize email addresses
  static sanitizeEmail(email) {
    if (typeof email !== 'string') return '';
    const sanitized = this.sanitizeText(email).toLowerCase();
    // Basic email validation regex
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(sanitized) ? sanitized : '';
  }

  // Sanitize numeric input
  static sanitizeNumber(input, min = -Infinity, max = Infinity) {
    const num = parseFloat(input);
    if (isNaN(num)) return null;
    return Math.max(min, Math.min(max, num));
  }

  // Sanitize filename (remove dangerous characters)
  static sanitizeFilename(filename) {
    if (typeof filename !== 'string') return 'file';
    return filename.replace(/[^a-zA-Z0-9._-]/g, '_').substring(0, 255);
  }

  // Check for suspicious patterns
  static containsSuspiciousPatterns(input) {
    if (typeof input !== 'string') return false;
    const suspiciousPatterns = [
      /<script/i,
      /javascript:/i,
      /on\w+\s*=/i,
      /data:\s*text\/html/i,
      /vbscript:/i,
      /expression\s*\(/i,
      /eval\s*\(/i,
    ];
    return suspiciousPatterns.some(pattern => pattern.test(input));
  }

  // Validate input length
  static validateLength(input, min = 0, max = 10000) {
    if (typeof input !== 'string') return false;
    const length = input.length;
    return length >= min && length <= max;
  }
}

export default InputSanitizer;
