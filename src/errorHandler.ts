import { HttpError } from './apiClient/httpError';

export type ErrorClassification =
  | 'network-error'
  | 'timeout-error'
  | 'http-400'
  | 'http-401'
  | 'http-403'
  | 'http-404'
  | 'http-500'
  | 'http-503'
  | 'http-other'
  | 'unknown-error';

export interface ErrorInfo {
  classification: ErrorClassification;
  title: string;
  message: string;
  suggestion?: string;
  details?: string;
}

/**
 * Classifies and formats errors to provide helpful user feedback.
 * Handles network errors, timeouts, HTTP errors, and other failure modes.
 */
export class ErrorHandler {
  /**
   * Classify an error and return user-friendly information.
   */
  public static classifyError(error: unknown): ErrorInfo {
    if (error instanceof HttpError) {
      return this.handleHttpError(error);
    }

    if (error instanceof Error) {
      return this.handleStandardError(error);
    }

    return {
      classification: 'unknown-error',
      title: 'Unknown Error',
      message: 'An unexpected error occurred.',
    };
  }

  private static handleHttpError(error: HttpError): ErrorInfo {
    const baseMessage = `HTTP ${error.status}`;

    switch (error.status) {
      case 400:
        return {
          classification: 'http-400',
          title: 'Bad Request',
          message: 'The request was invalid. Please check the SkyCMS editor is configured correctly.',
          suggestion: 'Verify the editor URL is correct and the website is accessible.',
          details: baseMessage,
        };

      case 401:
        return {
          classification: 'http-401',
          title: 'Authentication Failed',
          message: 'Your session has expired or credentials are invalid.',
          suggestion: 'Sign in again by running "SkyCMS: Sign In".',
          details: baseMessage,
        };

      case 403:
        return {
          classification: 'http-403',
          title: 'Access Denied',
          message: 'You do not have permission to access this resource.',
          suggestion: 'Check that your SkyCMS user account has the necessary permissions.',
          details: baseMessage,
        };

      case 404:
        return {
          classification: 'http-404',
          title: 'Not Found',
          message: 'The requested resource does not exist.',
          suggestion: 'The SkyCMS editor may have been updated or the resource has been deleted. Try refreshing.',
          details: baseMessage,
        };

      case 500:
        return {
          classification: 'http-500',
          title: 'Server Error',
          message: 'The SkyCMS editor encountered an internal error.',
          suggestion: 'Check the SkyCMS editor status or contact support if the problem persists.',
          details: baseMessage,
        };

      case 503:
        return {
          classification: 'http-503',
          title: 'Service Unavailable',
          message: 'The SkyCMS editor is temporarily unavailable.',
          suggestion: 'The server may be restarting. Please try again in a few moments.',
          details: baseMessage,
        };

      case 502:
        return {
          classification: 'http-other',
          title: 'Bad Gateway',
          message: 'The SkyCMS editor cannot be reached.',
          suggestion: 'Check your internet connection and verify the editor URL.',
          details: baseMessage,
        };

      default:
        return {
          classification: 'http-other',
          title: 'HTTP Error',
          message: `An HTTP ${error.status} error occurred.`,
          suggestion: 'Check your internet connection and verify the SkyCMS editor URL is correct.',
          details: baseMessage,
        };
    }
  }

  private static handleStandardError(error: Error): ErrorInfo {
    const message = error.message.toLowerCase();

    // Timeout detection
    if (message.includes('timeout') || message.includes('timed out')) {
      return {
        classification: 'timeout-error',
        title: 'Request Timeout',
        message: error.message,
        suggestion: 'Check your internet connection. If the problem persists, the SkyCMS editor may be slow to respond.',
        details: 'The request took too long to complete.',
      };
    }

    // Network connectivity errors
    if (
      message.includes('econnrefused') ||
      message.includes('unreachable') ||
      message.includes('enotfound') ||
      message.includes('cannot connect') ||
      message.includes('connection failed') ||
      message.includes('network is unreachable')
    ) {
      return {
        classification: 'network-error',
        title: 'Connection Failed',
        message: 'Cannot connect to the SkyCMS editor.',
        suggestion:
          'Verify that the editor URL is correct and accessible. Check your internet connection.',
        details: error.message,
      };
    }

    // JSON parsing errors (likely malformed response)
    if (message.includes('json') || message.includes('unexpected token')) {
      return {
        classification: 'network-error',
        title: 'Invalid Response',
        message: 'The SkyCMS editor returned an unexpected response.',
        suggestion: 'Try refreshing. The editor may need to be restarted.',
        details: 'Response parsing failed.',
      };
    }

    // Certificate/SSL errors (self-signed or expired)
    if (
      message.includes('cert') ||
      message.includes('ssl') ||
      message.includes('eproto') ||
      message.includes('unauthorized')
    ) {
      return {
        classification: 'network-error',
        title: 'Certificate Error',
        message: 'There is a certificate or SSL error connecting to the SkyCMS editor.',
        suggestion: 'If using a self-signed certificate for development, this is expected on first connection.',
        details: error.message,
      };
    }

    // Generic error
    return {
      classification: 'unknown-error',
      title: 'Error',
      message: error.message || 'An error occurred.',
    };
  }

  /**
   * Format an error info object into a user-facing error message.
   * @param prefix A prefix to prepend to the message (e.g., "Sign in failed.")
   * @param errorInfo The classified error information
   * @param includeDetails Whether to include technical details in the message
   */
  public static formatMessage(prefix: string, errorInfo: ErrorInfo, includeDetails: boolean = false): string {
    let message = prefix;

    if (errorInfo.message) {
      message = `${prefix}\n${errorInfo.message}`;
    }

    if (includeDetails && errorInfo.details) {
      message = `${message}\n(${errorInfo.details})`;
    }

    return message;
  }

  /**
   * Get a suggestion message for the user to resolve the error.
   */
  public static getSuggestion(errorInfo: ErrorInfo): string | undefined {
    return errorInfo.suggestion;
  }

  /**
   * Determine if an error is retryable.
   */
  public static isRetryable(errorInfo: ErrorInfo): boolean {
    return (
      errorInfo.classification === 'timeout-error' ||
      errorInfo.classification === 'http-503' ||
      errorInfo.classification === 'network-error'
    );
  }

  /**
   * Check if error indicates authentication is invalid.
   */
  public static isAuthenticationError(errorInfo: ErrorInfo): boolean {
    return errorInfo.classification === 'http-401';
  }
}
