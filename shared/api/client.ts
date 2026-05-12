export interface ApiClientOptions {
  baseUrl: string;
  getAuthToken?: () => Promise<string | null> | string | null;
  defaultTimeoutMs?: number;
}

export interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  timeoutMs?: number;
}

export class ApiError extends Error {
  status: number;
  payload: unknown;

  constructor(message: string, status: number, payload: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload;
  }
}

export class ApiClient {
  private baseUrl: string;
  private getAuthToken?: ApiClientOptions['getAuthToken'];
  private defaultTimeoutMs: number;

  constructor(opts: ApiClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, '');
    this.getAuthToken = opts.getAuthToken;
    this.defaultTimeoutMs = opts.defaultTimeoutMs ?? 8000;
  }

  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const { body, headers, timeoutMs, ...rest } = options;
    const url = `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs ?? this.defaultTimeoutMs);

    const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
    const finalHeaders: Record<string, string> = {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...(headers as Record<string, string> | undefined),
    };

    if (this.getAuthToken) {
      const token = await this.getAuthToken();
      if (token) finalHeaders.Authorization = `Bearer ${token}`;
    }

    let serializedBody: BodyInit | undefined;
    if (body === undefined) {
      serializedBody = undefined;
    } else if (isFormData) {
      serializedBody = body as FormData;
    } else {
      serializedBody = JSON.stringify(body);
    }

    try {
      const res = await fetch(url, {
        ...rest,
        headers: finalHeaders,
        body: serializedBody,
        signal: controller.signal,
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => ({ error: res.statusText }));
        const message = (payload as { error?: string })?.error || `Request failed (${res.status})`;
        throw new ApiError(message, res.status, payload);
      }

      // 204 No Content
      if (res.status === 204) return undefined as T;
      return (await res.json()) as T;
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') {
        throw new Error('Request timed out — please try again');
      }
      throw e;
    } finally {
      clearTimeout(timeout);
    }
  }
}
