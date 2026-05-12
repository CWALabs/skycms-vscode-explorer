import { ErrorHandler, ErrorInfo } from './errorHandler';
import { HttpError } from './apiClient/http';

describe('ErrorHandler', () => {
  describe('classifyError', () => {
    describe('HTTP errors', () => {
      it('should classify 400 as bad request', () => {
        const error = new HttpError(400, 'Bad request', undefined, 'POST', '/api/test');
        const info = ErrorHandler.classifyError(error);
        expect(info.classification).toBe('http-400');
        expect(info.title).toBe('Bad Request');
        expect(info.message).toContain('invalid');
      });

      it('should classify 401 as authentication failed', () => {
        const error = new HttpError(401, 'Unauthorized', undefined, 'GET', '/api/test');
        const info = ErrorHandler.classifyError(error);
        expect(info.classification).toBe('http-401');
        expect(info.title).toBe('Authentication Failed');
        expect(ErrorHandler.isAuthenticationError(info)).toBe(true);
      });

      it('should classify 403 as access denied', () => {
        const error = new HttpError(403, 'Forbidden', undefined, 'DELETE', '/api/test');
        const info = ErrorHandler.classifyError(error);
        expect(info.classification).toBe('http-403');
        expect(info.title).toBe('Access Denied');
      });

      it('should classify 404 as not found', () => {
        const error = new HttpError(404, 'Not found', undefined, 'GET', '/api/test');
        const info = ErrorHandler.classifyError(error);
        expect(info.classification).toBe('http-404');
        expect(info.title).toBe('Not Found');
      });

      it('should classify 500 as server error', () => {
        const error = new HttpError(500, 'Internal server error', undefined, 'POST', '/api/test');
        const info = ErrorHandler.classifyError(error);
        expect(info.classification).toBe('http-500');
        expect(info.title).toBe('Server Error');
      });

      it('should classify 503 as service unavailable', () => {
        const error = new HttpError(503, 'Service unavailable', undefined, 'GET', '/api/test');
        const info = ErrorHandler.classifyError(error);
        expect(info.classification).toBe('http-503');
        expect(info.title).toBe('Service Unavailable');
      });

      it('should classify 502 as bad gateway', () => {
        const error = new HttpError(502, 'Bad gateway', undefined, 'GET', '/api/test');
        const info = ErrorHandler.classifyError(error);
        expect(info.classification).toBe('http-other');
        expect(info.title).toBe('Bad Gateway');
      });

      it('should classify unknown status codes as http-other', () => {
        const error = new HttpError(418, 'I am a teapot', undefined, 'GET', '/api/test');
        const info = ErrorHandler.classifyError(error);
        expect(info.classification).toBe('http-other');
        expect(info.title).toBe('HTTP Error');
      });
    });

    describe('Timeout errors', () => {
      it('should detect timeout in error message', () => {
        const error = new Error('Request timed out after 20s: GET /api/test');
        const info = ErrorHandler.classifyError(error);
        expect(info.classification).toBe('timeout-error');
        expect(info.title).toBe('Request Timeout');
        expect(ErrorHandler.isRetryable(info)).toBe(true);
      });

      it('should detect "timed out" variant', () => {
        const error = new Error('Socket timed out');
        const info = ErrorHandler.classifyError(error);
        expect(info.classification).toBe('timeout-error');
      });
    });

    describe('Network errors', () => {
      it('should detect connection refused', () => {
        const error = new Error('ECONNREFUSED: Connection refused');
        const info = ErrorHandler.classifyError(error);
        expect(info.classification).toBe('network-error');
        expect(info.title).toBe('Connection Failed');
        expect(ErrorHandler.isRetryable(info)).toBe(true);
      });

      it('should detect host not found', () => {
        const error = new Error('ENOTFOUND editor.example.com');
        const info = ErrorHandler.classifyError(error);
        expect(info.classification).toBe('network-error');
      });

      it('should detect unreachable', () => {
        const error = new Error('Network is unreachable');
        const info = ErrorHandler.classifyError(error);
        expect(info.classification).toBe('network-error');
      });

      it('should detect SSL/certificate errors', () => {
        const error = new Error('CERT_HAS_EXPIRED: certificate has expired');
        const info = ErrorHandler.classifyError(error);
        expect(info.classification).toBe('network-error');
        expect(info.title).toBe('Certificate Error');
      });

      it('should detect JSON parsing errors', () => {
        const error = new Error('Unexpected token < in JSON at position 0');
        const info = ErrorHandler.classifyError(error);
        expect(info.classification).toBe('network-error');
        expect(info.title).toBe('Invalid Response');
      });
    });

    describe('Unknown errors', () => {
      it('should classify non-Error objects as unknown', () => {
        const info = ErrorHandler.classifyError('string error');
        expect(info.classification).toBe('unknown-error');
      });

      it('should classify numeric values as unknown', () => {
        const info = ErrorHandler.classifyError(42);
        expect(info.classification).toBe('unknown-error');
      });

      it('should classify generic Error objects as unknown', () => {
        const error = new Error('Something went wrong');
        const info = ErrorHandler.classifyError(error);
        expect(info.classification).toBe('unknown-error');
      });
    });
  });

  describe('formatMessage', () => {
    it('should format error message with prefix', () => {
      const errorInfo: ErrorInfo = {
        classification: 'http-500',
        title: 'Server Error',
        message: 'The SkyCMS editor encountered an internal error.',
      };
      const formatted = ErrorHandler.formatMessage('Sign in failed.', errorInfo);
      expect(formatted).toContain('Sign in failed.');
      expect(formatted).toContain('The SkyCMS editor encountered an internal error.');
    });

    it('should include details when requested', () => {
      const errorInfo: ErrorInfo = {
        classification: 'timeout-error',
        title: 'Request Timeout',
        message: 'The request took too long.',
        details: 'Request timed out after 20s',
      };
      const formatted = ErrorHandler.formatMessage('Failed.', errorInfo, true);
      expect(formatted).toContain('Request timed out after 20s');
    });

    it('should omit details when not requested', () => {
      const errorInfo: ErrorInfo = {
        classification: 'timeout-error',
        title: 'Request Timeout',
        message: 'The request took too long.',
        details: 'Request timed out after 20s',
      };
      const formatted = ErrorHandler.formatMessage('Failed.', errorInfo, false);
      expect(formatted).not.toContain('Request timed out after 20s');
    });
  });

  describe('getSuggestion', () => {
    it('should return suggestion when available', () => {
      const errorInfo: ErrorInfo = {
        classification: 'http-401',
        title: 'Auth Failed',
        message: 'Session expired',
        suggestion: 'Sign in again',
      };
      const suggestion = ErrorHandler.getSuggestion(errorInfo);
      expect(suggestion).toBe('Sign in again');
    });

    it('should return undefined when no suggestion', () => {
      const errorInfo: ErrorInfo = {
        classification: 'unknown-error',
        title: 'Error',
        message: 'An error occurred',
      };
      const suggestion = ErrorHandler.getSuggestion(errorInfo);
      expect(suggestion).toBeUndefined();
    });
  });

  describe('isRetryable', () => {
    it('should mark timeout errors as retryable', () => {
      const errorInfo: ErrorInfo = {
        classification: 'timeout-error',
        title: 'Timeout',
        message: 'Timed out',
      };
      expect(ErrorHandler.isRetryable(errorInfo)).toBe(true);
    });

    it('should mark 503 errors as retryable', () => {
      const errorInfo: ErrorInfo = {
        classification: 'http-503',
        title: 'Service Unavailable',
        message: 'Service down',
      };
      expect(ErrorHandler.isRetryable(errorInfo)).toBe(true);
    });

    it('should mark network errors as retryable', () => {
      const errorInfo: ErrorInfo = {
        classification: 'network-error',
        title: 'Connection Failed',
        message: 'Cannot connect',
      };
      expect(ErrorHandler.isRetryable(errorInfo)).toBe(true);
    });

    it('should not mark 401 errors as retryable', () => {
      const errorInfo: ErrorInfo = {
        classification: 'http-401',
        title: 'Auth Failed',
        message: 'Unauthorized',
      };
      expect(ErrorHandler.isRetryable(errorInfo)).toBe(false);
    });

    it('should not mark 404 errors as retryable', () => {
      const errorInfo: ErrorInfo = {
        classification: 'http-404',
        title: 'Not Found',
        message: 'Resource missing',
      };
      expect(ErrorHandler.isRetryable(errorInfo)).toBe(false);
    });
  });

  describe('isAuthenticationError', () => {
    it('should identify 401 as authentication error', () => {
      const errorInfo: ErrorInfo = {
        classification: 'http-401',
        title: 'Auth Failed',
        message: 'Unauthorized',
      };
      expect(ErrorHandler.isAuthenticationError(errorInfo)).toBe(true);
    });

    it('should not mark other errors as authentication errors', () => {
      const errorInfo: ErrorInfo = {
        classification: 'http-403',
        title: 'Access Denied',
        message: 'Forbidden',
      };
      expect(ErrorHandler.isAuthenticationError(errorInfo)).toBe(false);
    });
  });
});
