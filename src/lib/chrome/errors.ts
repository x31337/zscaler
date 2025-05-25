export class ChromeDriverError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'ChromeDriverError';
  }

  static CONNECTION_ERROR = 'CONNECTION_ERROR';
  static INITIALIZATION_ERROR = 'INITIALIZATION_ERROR';
  static NAVIGATION_ERROR = 'NAVIGATION_ERROR';
  static LOGIN_ERROR = 'LOGIN_ERROR';
  static TIMEOUT_ERROR = 'TIMEOUT_ERROR';
  static SELECTOR_ERROR = 'SELECTOR_ERROR';
}

export const ChromeErrors = {
  NOT_INITIALIZED: new ChromeDriverError(
    'Chrome driver not initialized',
    ChromeDriverError.INITIALIZATION_ERROR
  ),
  CONNECTION_FAILED: new ChromeDriverError(
    'Failed to connect to Chrome instance',
    ChromeDriverError.CONNECTION_ERROR
  ),
  NAVIGATION_FAILED: new ChromeDriverError(
    'Failed to navigate to portal',
    ChromeDriverError.NAVIGATION_ERROR
  ),
  LOGIN_FAILED: new ChromeDriverError(
    'Failed to complete login process',
    ChromeDriverError.LOGIN_ERROR
  ),
  TIMEOUT: new ChromeDriverError(
    'Operation timed out',
    ChromeDriverError.TIMEOUT_ERROR
  ),
  SELECTOR_NOT_FOUND: new ChromeDriverError(
    'Required page elements not found',
    ChromeDriverError.SELECTOR_ERROR
  )
} as const;

