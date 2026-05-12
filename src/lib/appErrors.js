import SecureErrorHandler from "../services/secureErrorHandler.js";
import securityLogger from "../services/securityLogger.js";

export function getSafeErrorMessage(error) {
  return SecureErrorHandler.getSafeErrorMessage(error);
}

export function logAppError(error, context = {}) {
  SecureErrorHandler.logError(error, context);
  securityLogger.log("ERROR", context.event || "APP_ERROR", {
    ...context,
    errorType: error?.name || "Unknown",
    statusCode: error?.status || null,
  });
}

export function getErrorMessage(error, fallback = "Something went wrong. Please try again.") {
  const message = getSafeErrorMessage(error);
  return message || fallback;
}
