/**
 * Where the login session lives on the client.
 *
 * After signup/login, the backend returns a signed JWT (see
 * backend/app/core/security.py). We keep it in localStorage under this key
 * so it survives page reloads and browser restarts -- that's what lets a
 * user log in once and stay logged in "anytime" without re-entering a
 * password every visit. The actual username/password are never stored
 * here or anywhere in the browser; only this opaque, expiring token is.
 */
const TOKEN_KEY = "legalgpt-auth-token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export function authHeader(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
