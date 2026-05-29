// Security audit logging utility
// Logs security events for monitoring and compliance

const LOG_LEVELS = {
  INFO: 'INFO',
  WARN: 'WARN',
  ERROR: 'ERROR',
  SECURITY: 'SECURITY'
};

class SecurityLogger {
  constructor() {
    this.events = [];
    this.maxEvents = 1000; // Keep last 1000 events in memory
    this.memorySessionId = null;
  }

  log(level, event, details = {}) {
    const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : 'node';
    const url = typeof window !== 'undefined' && window.location
      ? `${window.location.pathname || ''}${window.location.hash || ''}`
      : 'node';
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      event,
      details: {
        ...details,
        userAgent,
        url,
        sessionId: this.getSessionId()
      }
    };

    // Add to in-memory log
    this.events.push(logEntry);
    if (this.events.length > this.maxEvents) {
      this.events.shift(); // Remove oldest
    }

    // Console logging only in development
    if (typeof import.meta !== 'undefined' && import.meta.env?.DEV) {
      console.debug(`[${level}] ${event}`, details);
    }

    // Ship to server-side logging endpoint when configured (OWASP: audit trail)
    this.sendToLoggingService(logEntry);
  }

  // Generate or retrieve session ID
  getSessionId() {
    if (!this.memorySessionId) {
      this.memorySessionId = this.generateSessionId();
    }
    return this.memorySessionId;
  }

  generateSessionId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    const randomBytes = typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function'
      ? crypto.getRandomValues(new Uint32Array(2))
      : [Date.now() & 0xffffffff, (Date.now() >>> 0) ^ 0xa5a5a5a5];
    return `session_${randomBytes[0].toString(36)}_${randomBytes[1].toString(36)}_${Date.now()}`;
  }

  // Security event logging methods
  logAuthAttempt(email, success, method = 'otp') {
    this.log(LOG_LEVELS.SECURITY, 'AUTH_ATTEMPT', {
      email: this.maskEmail(email),
      success,
      method,
      ip: 'client-side' // Would be server-side in production
    });
  }

  logAuthSuccess(userId, email) {
    this.log(LOG_LEVELS.SECURITY, 'AUTH_SUCCESS', {
      userId,
      email: this.maskEmail(email)
    });
  }

  logAuthFailure(email, reason) {
    this.log(LOG_LEVELS.SECURITY, 'AUTH_FAILURE', {
      email: this.maskEmail(email),
      reason
    });
  }

  logDataExport(userId, dataType, recordCount) {
    this.log(LOG_LEVELS.SECURITY, 'DATA_EXPORT', {
      userId,
      dataType,
      recordCount
    });
  }

  logSuspiciousActivity(activity, details) {
    this.log(LOG_LEVELS.SECURITY, 'SUSPICIOUS_ACTIVITY', {
      activity,
      ...details
    });
  }

  logRateLimitExceeded(identifier, limitType) {
    this.log(LOG_LEVELS.SECURITY, 'RATE_LIMIT_EXCEEDED', {
      identifier: this.maskEmail(identifier),
      limitType
    });
  }

  // Mask sensitive information
  maskEmail(email) {
    if (!email || !email.includes('@')) return 'invalid';
    const [local, domain] = email.split('@');
    const maskedLocal = local.length > 2
      ? local.substring(0, 2) + '*'.repeat(local.length - 2)
      : local + '*';
    return `${maskedLocal}@${domain}`;
  }

  // Get recent events for debugging (last 50)
  getRecentEvents() {
    return this.events.slice(-50);
  }

  // Ship logs to server-side aggregation endpoint
  sendToLoggingService(logEntry) {
    try {
      const endpoint = typeof window !== 'undefined'
        ? (window.__LOCI_ENV__?.VITE_LOG_ENDPOINT || "")
        : "";
      if (!endpoint) return;

      // Fire-and-forget; don't block on logging
      fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(logEntry),
        keepalive: true,
      }).catch(() => { /* Log delivery is best-effort */ });
    } catch {
      // Never let logging failures break the app
    }
  }

  // Export logs for admin review (always available for debugging)
  exportLogs() {
    return {
      events: [...this.events],
      exportedAt: new Date().toISOString(),
      totalEvents: this.events.length,
    };
  }
}

// Create singleton instance
const securityLogger = new SecurityLogger();

export default securityLogger;
