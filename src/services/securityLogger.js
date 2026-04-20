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
  }

  log(level, event, details = {}) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      event,
      details: {
        ...details,
        userAgent: navigator.userAgent,
        url: window.location.href,
        sessionId: this.getSessionId()
      }
    };

    // Add to in-memory log
    this.events.push(logEntry);
    if (this.events.length > this.maxEvents) {
      this.events.shift(); // Remove oldest
    }

    // Console logging for development
    console.log(`[${level}] ${event}`, details);

    // In production, this would send to a logging service
    // this.sendToLoggingService(logEntry);
  }

  // Generate or retrieve session ID
  getSessionId() {
    let sessionId = sessionStorage.getItem('session_id');
    if (!sessionId) {
      sessionId = crypto.randomUUID();
      sessionStorage.setItem('session_id', sessionId);
    }
    return sessionId;
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

  // Export logs for admin review
  exportLogs() {
    return {
      events: this.events,
      exportedAt: new Date().toISOString(),
      totalEvents: this.events.length
    };
  }
}

// Create singleton instance
const securityLogger = new SecurityLogger();

export default securityLogger;