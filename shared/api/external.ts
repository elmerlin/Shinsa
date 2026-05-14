import type { ApiClient } from './client';

/** Metadata for a user-generated personal access token. The plaintext token
 *  itself is only ever returned at creation time (in `CreateApiTokenResponse.token`)
 *  — the server stores a hash only, so listing tokens never exposes the secret. */
export interface ApiTokenRow {
  id: number;
  name: string;
  scopes: string[];
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

export interface ListApiTokensResponse {
  tokens: ApiTokenRow[];
}

export interface CreateApiTokenPayload {
  name?: string;
  scopes?: string[];
}

export interface CreateApiTokenResponse extends ApiTokenRow {
  /** The plaintext token. Only returned at creation time — store / show it
   *  to the user immediately, the server keeps only a hash. */
  token: string;
}

export function createExternalApi(client: ApiClient) {
  return {
    listTokens() {
      return client.request<ListApiTokensResponse>('/api/external/tokens');
    },
    createToken(payload: CreateApiTokenPayload) {
      return client.request<CreateApiTokenResponse>('/api/external/tokens', {
        method: 'POST',
        body: payload,
      });
    },
    revokeToken(id: number) {
      return client.request<{ ok: true }>(`/api/external/tokens/${id}/revoke`, {
        method: 'POST',
      });
    },
  };
}

export type ExternalApi = ReturnType<typeof createExternalApi>;
