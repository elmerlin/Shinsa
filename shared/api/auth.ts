import type { ApiClient } from './client';
import type { AuthResponse, LoginPayload, RegisterPayload, User } from './types';

export function createAuthApi(client: ApiClient) {
  return {
    login(body: LoginPayload) {
      return client.request<AuthResponse>('/api/auth/login', {
        method: 'POST',
        body,
      });
    },
    register(body: RegisterPayload) {
      return client.request<AuthResponse>('/api/auth/register', {
        method: 'POST',
        body,
      });
    },
    me() {
      return client.request<User>('/api/auth/me');
    },
  };
}

export type AuthApi = ReturnType<typeof createAuthApi>;
