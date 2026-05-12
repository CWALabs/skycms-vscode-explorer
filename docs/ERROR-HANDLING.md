# Error Handling Improvements

This document describes the enhanced error handling system in the SkyCMS Explorer extension.

## Overview

The extension now provides robust, user-friendly error handling for common failure scenarios:

- **Network connectivity issues** (unreachable editor, DNS failures)
- **HTTP errors** (4xx, 5xx status codes)
- **Timeouts** (slow or unresponsive editor)
- **Certificate/SSL errors** (self-signed certs in development)
- **Malformed responses** (invalid JSON, HTML error pages)

## Architecture

### ErrorHandler Utility (`errorHandler.ts`)

The `ErrorHandler` class classifies errors and provides actionable feedback:

```typescript
const errorInfo = ErrorHandler.classifyError(error);
// Classifies error and returns ErrorInfo with:
// - classification: specific error type
// - title: user-friendly title
// - message: clear explanation
// - suggestion: how to resolve
// - details: technical context
```

**Error Classifications:**
- `network-error` — Connection failure, DNS, certificates
- `timeout-error` — Request took too long
- `http-400` — Bad request (invalid input)
- `http-401` — Authentication expired or invalid
- `http-403` — Permission denied
- `http-404` — Resource not found
- `http-500` — Server error
- `http-503` — Service temporarily unavailable
- `http-other` — Other HTTP errors
- `unknown-error` — Unclassified error

**Utility Methods:**
- `formatMessage()` — Generate user-facing message with optional technical details
- `getSuggestion()` — Get actionable advice for resolving the error
- `isRetryable()` — Check if the operation should be retried
- `isAuthenticationError()` — Detect authentication-related failures

### Enhanced HttpError Class

The `HttpError` class now captures additional context:

```typescript
new HttpError(
  status,        // HTTP status code (e.g., 500)
  message,       // Error message
  body,          // Response body (optional)
  method,        // HTTP method (e.g., 'GET')
  path           // API endpoint path
)
```

### Improved showError Function

The extension's `showError()` function now uses `ErrorHandler`:

```typescript
showError('Sign in failed.', error);
```

This displays:
- The provided prefix
- Classified error message
- Actionable suggestion (if available)
- All logged with error classification for debugging

### Error Nodes in Tree View

Tree nodes that fail to load now display error indicators instead of silently disappearing:

```typescript
// Before: return []; // Silent failure
// After: return [SkyCmsNode.error(errorMessage, errorDetails)];
```

Users see an error node with:
- Clear error message
- Technical details
- Clickable action to retry

## Usage Examples

### In Commands

```typescript
vscode.commands.registerCommand('skycms.myCommand', async () => {
  try {
    await withBusyIndicator('Loading...', () => myAsyncOperation());
  } catch (error) {
    showError('Operation failed.', error);
  }
});
```

### In API Calls

The HTTP layer automatically classifies errors through `HttpError`:

```typescript
const response = await requestJson({
  baseUrl,
  path: '/api/articles',
  method: 'GET',
  token,
  // Errors are thrown as HttpError with full context
});
```

### In Tree Provider

Error handlers show user-friendly nodes:

```typescript
private async getCategoryChildren(category: SkyCmsNode): Promise<SkyCmsNode[]> {
  try {
    return await this.queryClient.getLayouts();
  } catch (error) {
    logError('Failed to load', error);
    const errorInfo = ErrorHandler.classifyError(error);
    return [SkyCmsNode.error(errorInfo.title, errorInfo.suggestion)];
  }
}
```

## Error Scenarios

### Network Unreachable

**User sees:**
- Title: "Connection Failed"
- Message: "Cannot connect to the SkyCMS editor."
- Suggestion: "Verify that the editor URL is correct and accessible. Check your internet connection."

**Retryable:** Yes

### Authentication Expired (401)

**User sees:**
- Title: "Authentication Failed"
- Message: "Your session has expired or credentials are invalid."
- Suggestion: "Sign in again by running 'SkyCMS: Sign In'."

**Retryable:** No — Requires re-authentication

### Request Timeout

**User sees:**
- Title: "Request Timeout"
- Message: "Request timed out after 20s: GET /api/articles"
- Suggestion: "Check your internet connection. If the problem persists, the SkyCMS editor may be slow to respond."

**Retryable:** Yes

### Server Error (500)

**User sees:**
- Title: "Server Error"
- Message: "The SkyCMS editor encountered an internal error."
- Suggestion: "Check the SkyCMS editor status or contact support if the problem persists."

**Retryable:** No — Requires server-side fix

### Service Unavailable (503)

**User sees:**
- Title: "Service Unavailable"
- Message: "The SkyCMS editor is temporarily unavailable."
- Suggestion: "The server may be restarting. Please try again in a few moments."

**Retryable:** Yes

### Invalid Response

**User sees:**
- Title: "Invalid Response"
- Message: "The SkyCMS editor returned an unexpected response."
- Suggestion: "Try refreshing. The editor may need to be restarted."

**Retryable:** Yes

## Logging

All errors are logged with their classification:

```
[ERROR] Sign in failed [http-401]: Error message
[ERROR] Failed to load articles [timeout-error]: Request timed out after 20s
```

This aids debugging and understanding failure patterns.

## Testing

Error handling is covered by tests in `errorHandler.test.ts`:

```bash
npm test -- errorHandler.test.ts
```

Tests verify:
- Correct error classification for all HTTP status codes
- Network error detection (DNS, connection refused, SSL, etc.)
- Timeout detection
- Suggestion accuracy
- Retry eligibility
- Message formatting

## Migration Notes

### Before

Errors were shown minimally:
```typescript
showError('Failed.', error);
// → "Failed. HTTP 500."
```

### After

Errors include context and suggestions:
```typescript
showError('Failed.', error);
// → "Failed.
//    The SkyCMS editor encountered an internal error.
//    
//    Check the SkyCMS editor status or contact support if the problem persists."
```

### Tree Provider

Previously, errors silently returned empty arrays:
```typescript
try {
  return await this.queryClient.getLayouts();
} catch {
  return []; // Users see nothing!
}
```

Now they show error nodes:
```typescript
try {
  return await this.queryClient.getLayouts();
} catch (error) {
  return [SkyCmsNode.error('Failed to load layouts', 'HTTP 500')];
}
```

## Future Enhancements

Potential improvements:
- **Automatic retry** for retryable errors (with backoff)
- **Error analytics** to track common failures
- **Recovery actions** (e.g., "Retry", "Sign In Again", "Open Editor")
- **Offline mode detection** with local-first fallback
- **Rate limit handling** with smart backoff
- **Circuit breaker** pattern for cascading failures
