// Secure error handling utilities
// Prevents information leakage through error messages

class SecureErrorHandler {
  // Map of error types to user-friendly messages
  static ERROR_MESSAGES = {
    NETWORK_ERROR: "Connection failed. Please check your internet and try again.",
    AUTH_ERROR: "Authentication failed. Please try signing in again.",
    VALIDATION_ERROR: "Invalid input. Please check your data and try again.",
    PERMISSION_ERROR: "Access denied. You don't have permission to perform this action.",
    SERVER_ERROR: "Something went wrong on our end. Please try again later.",
    RATE_LIMIT_ERROR: "Too many requests. Please wait a moment before trying again.",
    UNKNOWN_ERROR: "An unexpected error occurred. Please try again."
  };

  // Classify error and return safe message
  static getSafeErrorMessage(error) {
    if (!error) return this.ERROR_MESSAGES.UNKNOWN_ERROR;

    // Network errors
    if (this.isNetworkError(error)) {
      return this.ERROR_MESSAGES.NETWORK_ERROR;
    }

    // Authentication errors
    if (this.isAuthError(error)) {
      return this.ERROR_MESSAGES.AUTH_ERROR;
    }

    // Validation errors
    if (this.isValidationError(error)) {
      return this.ERROR_MESSAGES.VALIDATION_ERROR;
    }

    // Permission errors
    if (this.isPermissionError(error)) {
      return this.ERROR_MESSAGES.PERMISSION_ERROR;
    }

    // Rate limiting
    if (this.isRateLimitError(error)) {
      return this.ERROR_MESSAGES.RATE_LIMIT_ERROR;
    }

    // Server errors (5xx)
    if (this.isServerError(error)) {
      return this.ERROR_MESSAGES.SERVER_ERROR;
    }

    // Default to unknown error
    return this.ERROR_MESSAGES.UNKNOWN_ERROR;
  }

  // Error type classifiers
  static isNetworkError(error) {
    return error.name === 'NetworkError' ||
           error.message?.includes('fetch') ||
           error.message?.includes('network') ||
           error.code === 'NETWORK_ERROR';
  }

  static isAuthError(error) {
    return error.message?.includes('auth') ||
           error.message?.includes('unauthorized') ||
           error.message?.includes('forbidden') ||
           error.status === 401 ||
           error.status === 403;
  }

  static isValidationError(error) {
    return error.message?.includes('validation') ||
           error.message?.includes('invalid') ||
           error.status === 400;
  }

  static isPermissionError(error) {
    return error.message?.includes('permission') ||
           error.message?.includes('access denied') ||
           error.status === 403;
  }

  static isRateLimitError(error) {
    return error.message?.includes('rate limit') ||
           error.message?.includes('too many') ||
           error.status === 429;
  }

  static isServerError(error) {
    return error.status >= 500 && error.status < 600;
  }

  // Log error securely (without sensitive data)
  static logError(error, context = {}) {
    const safeContext = {
      ...context,
      timestamp: new Date().toISOString(),
      errorType: error?.name || 'Unknown',
      statusCode: error?.status,
      // Don't log error.message as it might contain sensitive info
    };

    console.error('Secure Error Log:', safeContext);

    // In production, send to error monitoring service
    // this.sendToErrorMonitoring(safeContext);
  }

  // Handle async errors safely
  static async safeAsync(fn, errorContext = {}) {
    try {
      return await fn();
    } catch (error) {
      this.logError(error, errorContext);
      throw new Error(this.getSafeErrorMessage(error));
    }
  }

  // Handle sync errors safely
  static safeSync(fn, errorContext = {}) {
    try {
      return fn();
    } catch (error) {
      this.logError(error, errorContext);
      throw new Error(this.getSafeErrorMessage(error));
    }
  }
}

export default SecureErrorHandler;