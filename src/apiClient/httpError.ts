export class HttpError extends Error {
  public readonly status: number;
  public readonly responseBody?: unknown;
  public readonly method?: string;
  public readonly path?: string;

  public constructor(
    status: number,
    message: string,
    responseBody?: unknown,
    method?: string,
    path?: string,
  ) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.responseBody = responseBody;
    this.method = method;
    this.path = path;
  }
}