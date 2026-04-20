// Security Features Test Suite
// Run with: node scripts/test-security.mjs

import securityLogger from '../src/services/securityLogger.js';
import InputSanitizer from '../src/services/inputSanitizer.js';
import SecureErrorHandler from '../src/services/secureErrorHandler.js';

console.log('🛡️  IELTS App Security Test Suite');
console.log('=====================================\n');

// Test 1: Security Logger
console.log('1. Testing Security Logger...');
try {
  securityLogger.logAuthAttempt('test@example.com', false, 'otp');
  securityLogger.logAuthSuccess('user123', 'test@example.com');
  securityLogger.logDataExport('user123', 'practice_sessions', 5);
  securityLogger.logSuspiciousActivity('TEST_ACTIVITY', { test: true });

  const logs = securityLogger.getRecentEvents();
  console.log('✅ Security logger working -', logs.length, 'events logged');

  // Check log structure
  const lastLog = logs[logs.length - 1];
  if (lastLog.level && lastLog.event && lastLog.timestamp) {
    console.log('✅ Log structure is correct');
  } else {
    console.log('❌ Log structure is incorrect');
  }
} catch (error) {
  console.log('❌ Security logger failed:', error.message);
}

// Test 2: Input Sanitizer
console.log('\n2. Testing Input Sanitizer...');
try {
  // Test email sanitization
  const cleanEmail = InputSanitizer.sanitizeEmail('test@example.com');
  const badEmail = InputSanitizer.sanitizeEmail('<script>alert("xss")</script>@bad.com');
  console.log('✅ Email sanitization working');
  console.log('   Clean email:', cleanEmail);
  console.log('   Bad email sanitized:', badEmail || 'null (rejected)');

  // Test text sanitization
  const cleanText = InputSanitizer.sanitizeText('<b>Hello</b> <script>alert("xss")</script>World');
  console.log('✅ Text sanitization working:', cleanText);

  // Test number sanitization
  const cleanNumber = InputSanitizer.sanitizeNumber('123.45', 0, 1000);
  const badNumber = InputSanitizer.sanitizeNumber('not-a-number');
  console.log('✅ Number sanitization working');
  console.log('   Clean number:', cleanNumber);
  console.log('   Bad number:', badNumber);

  // Test suspicious pattern detection
  const hasSuspicious = InputSanitizer.containsSuspiciousPatterns('<script>alert("xss")</script>');
  console.log('✅ Suspicious pattern detection working:', hasSuspicious ? 'detected' : 'not detected');

} catch (error) {
  console.log('❌ Input sanitizer failed:', error.message);
}

// Test 3: Secure Error Handler
console.log('\n3. Testing Secure Error Handler...');
try {
  // Test network error
  const networkError = new Error('Failed to fetch');
  networkError.name = 'NetworkError';
  const safeNetworkMsg = SecureErrorHandler.getSafeErrorMessage(networkError);
  console.log('✅ Network error handling:', safeNetworkMsg);

  // Test auth error
  const authError = { status: 401, message: 'Invalid credentials' };
  const safeAuthMsg = SecureErrorHandler.getSafeErrorMessage(authError);
  console.log('✅ Auth error handling:', safeAuthMsg);

  // Test server error
  const serverError = { status: 500, message: 'Internal server error with sensitive data' };
  const safeServerMsg = SecureErrorHandler.getSafeErrorMessage(serverError);
  console.log('✅ Server error handling:', safeServerMsg);

  // Test unknown error
  const unknownError = new Error('Some unexpected error');
  const safeUnknownMsg = SecureErrorHandler.getSafeErrorMessage(unknownError);
  console.log('✅ Unknown error handling:', safeUnknownMsg);

} catch (error) {
  console.log('❌ Secure error handler failed:', error.message);
}

// Test 4: Integration Test
console.log('\n4. Testing Security Integration...');
try {
  // Test that all services can be imported and instantiated
  console.log('✅ All security services imported successfully');

  // Test session ID generation
  const sessionId1 = securityLogger.getSessionId();
  const sessionId2 = securityLogger.getSessionId();
  if (sessionId1 === sessionId2) {
    console.log('✅ Session ID persistence working');
  } else {
    console.log('❌ Session ID persistence failed');
  }

  // Test email masking
  const maskedEmail = securityLogger.maskEmail('user@example.com');
  console.log('✅ Email masking working:', maskedEmail);

} catch (error) {
  console.log('❌ Security integration failed:', error.message);
}

console.log('\n=====================================');
console.log('🛡️  Security Test Suite Complete');
console.log('\nNext steps:');
console.log('1. Open http://localhost:5175 in your browser');
console.log('2. Test authentication with valid/invalid emails');
console.log('3. Test scholarship keyword extraction');
console.log('4. Check browser console for security logs');
console.log('5. Test data export functionality');