import { useSyncExternalStore } from "react";
import type { GoTrueClient, Session } from "@supabase/auth-js";

/**
 * Staging account sign-in through Supabase Auth.
 *
 * Only the public Project URL and publishable key are used here (build-time env, never committed).
 * The session lives in sessionStorage, so it ends when the tab closes; auth-js refreshes the
 * access token before it expires and emits SIGNED_OUT when refresh is no longer possible.
 * Anonymous use never touches this module beyond `authConfigured`.
 */

export interface AuthUser {
  id: string;
  email: string | null;
}

export type AuthState =
  | { status: "unconfigured" }
  | { status: "loading" }
  | { status: "signed_out"; reason: "signed_out" | "expired" | null }
  | { status: "signed_in"; user: AuthUser };

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() ?? "";
const publishableKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined)?.trim() ?? "";

export const authConfigured = /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(url) && publishableKey.length > 0;

let client: GoTrueClient | null = null;
let state: AuthState = authConfigured ? { status: "loading" } : { status: "unconfigured" };
let explicitSignOut = false;
const listeners = new Set<() => void>();

function setState(next: AuthState) {
  state = next;
  listeners.forEach((l) => l());
}

const sessionStore = {
  getItem: (key: string) => {
    try {
      return window.sessionStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem: (key: string, value: string) => {
    try {
      window.sessionStorage.setItem(key, value);
    } catch {
      /* storage unavailable: the session simply does not persist across reloads */
    }
  },
  removeItem: (key: string) => {
    try {
      window.sessionStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  },
};

function userOf(session: Session): AuthUser {
  return { id: session.user.id, email: session.user.email ?? null };
}

async function getClient(): Promise<GoTrueClient> {
  if (client) return client;
  const { GoTrueClient } = await import("@supabase/auth-js");
  client = new GoTrueClient({
    url: `${url.replace(/\/$/, "")}/auth/v1`,
    headers: { apikey: publishableKey },
    storageKey: "sli-staging-auth",
    storage: sessionStore,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  });
  client.onAuthStateChange((event, session) => {
    if (session) {
      setState({ status: "signed_in", user: userOf(session) });
    } else if (event === "SIGNED_OUT" || event === "INITIAL_SESSION") {
      const wasSignedIn = state.status === "signed_in";
      setState({ status: "signed_out", reason: explicitSignOut ? "signed_out" : wasSignedIn ? "expired" : null });
      explicitSignOut = false;
    }
  });
  return client;
}

/** Starts restoring any session from this tab. Safe to call repeatedly. */
export function initAuth(): void {
  if (authConfigured) void getClient();
}

export function getAuthState(): AuthState {
  return state;
}

export function subscribeAuth(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useAuth(): AuthState {
  return useSyncExternalStore(subscribeAuth, getAuthState, getAuthState);
}

function authSettled(): Promise<void> {
  if (state.status !== "loading") return Promise.resolve();
  initAuth();
  return new Promise((resolve) => {
    const off = subscribeAuth(() => {
      if (state.status !== "loading") {
        off();
        resolve();
      }
    });
  });
}

/**
 * The current access token (refreshed by auth-js when needed), or null when signed out.
 * Waits while a stored session is being restored so a signed-in job is never requested anonymously.
 */
export async function getAccessToken(): Promise<string | null> {
  if (!authConfigured) return null;
  await authSettled();
  if (state.status !== "signed_in") return null;
  const { data } = await (await getClient()).getSession();
  return data.session?.access_token ?? null;
}

export async function signIn(email: string, password: string): Promise<string | null> {
  const { error } = await (await getClient()).signInWithPassword({ email, password });
  return error ? friendlyAuthError(error.message) : null;
}

/** Returns null on success with an active session, "confirm" when email confirmation is required, or an error message. */
export async function signUp(email: string, password: string): Promise<string | null> {
  const { data, error } = await (await getClient()).signUp({ email, password });
  if (error) return friendlyAuthError(error.message);
  return data.session ? null : "confirm";
}

export async function signOut(): Promise<void> {
  explicitSignOut = true;
  await (await getClient()).signOut({ scope: "local" });
}

/** Called when the API rejects the token (expired or revoked): drop the local session. */
export async function expireSession(): Promise<void> {
  if (state.status !== "signed_in") return;
  explicitSignOut = false;
  await (await getClient()).signOut({ scope: "local" });
}

function friendlyAuthError(message: string): string {
  if (/invalid login credentials/i.test(message)) return "Email or password is incorrect.";
  if (/email not confirmed/i.test(message)) return "Confirm your email address first, then sign in.";
  if (/already registered|already exists/i.test(message)) return "An account with this email already exists. Sign in instead.";
  if (/password/i.test(message) && /least|short|weak/i.test(message)) return "Choose a longer password.";
  if (/rate limit|too many/i.test(message)) return "Too many attempts. Wait a moment and try again.";
  if (/fetch|network/i.test(message)) return "Could not reach the sign-in service. Check your connection.";
  return "Sign-in failed. Try again.";
}

/** Identity key for keeping anonymous and per-account temporary analyses apart in this tab. */
export function identityKey(s: AuthState = state): string {
  return s.status === "signed_in" ? `user:${s.user.id}` : "anon";
}
