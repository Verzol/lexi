import type { components } from "./schema";

export type UserOut = components["schemas"]["UserOut"];
export type TokenResponse = components["schemas"]["TokenResponse"];
export type AssignedDeck = components["schemas"]["AssignedDeckOut"];
export type Card = components["schemas"]["CardOut"];
export type ReviewCard = components["schemas"]["ReviewCardOut"];
export type GradeResult = components["schemas"]["GradeOut"];
export type Rating = components["schemas"]["Rating"];
export type Deck = components["schemas"]["DeckOut"];
export type Enrichment = components["schemas"]["EnrichmentOut"];
export type BulkEnrichItem = components["schemas"]["BulkEnrichItem"];
export type AssignmentOut = components["schemas"]["AssignmentOut"];
export type QuizQuestion = components["schemas"]["QuizQuestion"];
export type QuizKind = components["schemas"]["QuizKind"];
export type QuizAnswerResult = components["schemas"]["QuizAnswerOut"];
export type Dashboard = components["schemas"]["DashboardOut"];
export type DashboardStudent = components["schemas"]["DashboardStudent"];
export type DeckProgress = components["schemas"]["DeckProgress"];

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

/**
 * The access token is held in memory only — never localStorage, which is
 * readable by any injected script. The long-lived refresh token lives in an
 * httpOnly cookie the JS side can't touch.
 */
let accessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function parseError(res: Response): Promise<string> {
  try {
    const body = await res.json();
    const detail = body?.detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail) && detail[0]?.msg) return detail[0].msg;
  } catch {
    // fall through to the generic message
  }
  return res.statusText || "Something went wrong";
}

async function raw(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (init.body) headers.set("Content-Type", "application/json");
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);

  return fetch(`${BASE}${path}`, {
    ...init,
    headers,
    // Required for the refresh cookie to ride along on /auth/* calls.
    credentials: "include",
  });
}

/** Exchange the httpOnly refresh cookie for a fresh access token. */
export async function refresh(): Promise<TokenResponse | null> {
  const res = await fetch(`${BASE}/auth/refresh`, {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) {
    accessToken = null;
    return null;
  }
  const body: TokenResponse = await res.json();
  accessToken = body.access_token;
  return body;
}

/**
 * Access tokens are short-lived by design, so a 401 mid-session is expected,
 * not exceptional: refresh once and replay the request before giving up.
 */
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res = await raw(path, init);

  if (res.status === 401 && accessToken !== null) {
    const refreshed = await refresh();
    if (refreshed) res = await raw(path, init);
  }

  if (!res.ok) throw new ApiError(res.status, await parseError(res));
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const auth = {
  login: (email: string, password: string) =>
    api<TokenResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  /** Public self-signup — always creates a student and logs them straight in. */
  register: (body: { email: string; display_name: string; password: string; timezone?: string }) =>
    api<TokenResponse>("/auth/register", { method: "POST", body: JSON.stringify(body) }),
  /** Sign in / up with a Google Identity Services credential (ID token). */
  google: (credential: string) =>
    api<TokenResponse>("/auth/google", {
      method: "POST",
      body: JSON.stringify({ credential }),
    }),
  logout: () => api<void>("/auth/logout", { method: "POST" }),
  me: () => api<UserOut>("/auth/me"),
  /** Confirm an email from the signup link. */
  verifyEmail: (token: string) =>
    api<UserOut>("/auth/verify-email", { method: "POST", body: JSON.stringify({ token }) }),
  /** Re-send the confirmation email to the signed-in user. */
  resendVerification: () => api<void>("/auth/resend-verification", { method: "POST" }),
};

/** A card a student authors in their own deck (manual entry only — no AI). */
export type PersonalCard = {
  term: string;
  meaning: string;
  ipa?: string | null;
  example_sentence?: string | null;
};

export const decks = {
  listMine: () => api<AssignedDeck[]>("/decks"),
  cards: (deckId: number) => api<Card[]>(`/decks/${deckId}/cards`),
  // Student-owned decks (personal vocab). The API enforces ownership; a deck you
  // don't own 404s, exactly like the read side.
  create: (body: { name: string; description?: string | null }) =>
    api<AssignedDeck>("/decks", { method: "POST", body: JSON.stringify(body) }),
  rename: (deckId: number, patch: { name?: string; description?: string | null }) =>
    api<AssignedDeck>(`/decks/${deckId}`, { method: "PATCH", body: JSON.stringify(patch) }),
  remove: (deckId: number) => api<void>(`/decks/${deckId}`, { method: "DELETE" }),
  addCard: (deckId: number, card: PersonalCard) =>
    api<Card>(`/decks/${deckId}/cards`, { method: "POST", body: JSON.stringify(card) }),
  updateCard: (deckId: number, cardId: number, patch: Partial<PersonalCard>) =>
    api<Card>(`/decks/${deckId}/cards/${cardId}`, { method: "PATCH", body: JSON.stringify(patch) }),
  deleteCard: (deckId: number, cardId: number) =>
    api<void>(`/decks/${deckId}/cards/${cardId}`, { method: "DELETE" }),
};

export const review = {
  due: () => api<ReviewCard[]>("/review/due"),
  grade: (cardId: number, rating: Rating, elapsedMs?: number) =>
    api<GradeResult>("/review/grade", {
      method: "POST",
      body: JSON.stringify({ card_id: cardId, rating, elapsed_ms: elapsedMs ?? null }),
    }),
};

export const quiz = {
  get: () => api<QuizQuestion[]>("/quiz"),
  answer: (cardId: number, kind: QuizKind, answer: string, elapsedMs?: number) =>
    api<QuizAnswerResult>("/quiz/answer", {
      method: "POST",
      body: JSON.stringify({
        card_id: cardId,
        kind,
        answer,
        elapsed_ms: elapsedMs ?? null,
      }),
    }),
};

export type NewCard = {
  term: string;
  meaning: string;
  ipa?: string | null;
  example_sentence?: string | null;
  source?: "manual" | "ai-enriched";
};

/** Teacher-only surface. Authorization is enforced by the API, not here. */
export const admin = {
  dashboard: () => api<Dashboard>("/admin/dashboard"),
  decks: () => api<Deck[]>("/admin/decks"),
  createDeck: (body: { name: string; description?: string; exam_tag?: string; topic_tags?: string[] }) =>
    api<Deck>("/admin/decks", { method: "POST", body: JSON.stringify(body) }),
  cards: (deckId: number) => api<Card[]>(`/admin/decks/${deckId}/cards`),
  createCard: (deckId: number, card: NewCard) =>
    api<Card>(`/admin/decks/${deckId}/cards`, { method: "POST", body: JSON.stringify(card) }),
  updateCard: (cardId: number, patch: Partial<NewCard> & { deck_id?: number }) =>
    api<Card>(`/admin/cards/${cardId}`, { method: "PATCH", body: JSON.stringify(patch) }),
  deleteCard: (cardId: number) => api<void>(`/admin/cards/${cardId}`, { method: "DELETE" }),
  enrich: (term: string) =>
    api<Enrichment>("/admin/enrich", { method: "POST", body: JSON.stringify({ term }) }),
  enrichBulk: (terms: string[]) =>
    api<BulkEnrichItem[]>("/admin/enrich/bulk", {
      method: "POST",
      body: JSON.stringify({ terms }),
    }),
  students: () => api<UserOut[]>("/auth/students"),
  createStudent: (body: {
    email: string;
    password: string;
    display_name: string;
    timezone?: string;
    daily_new_target?: number;
  }) => api<UserOut>("/auth/students", { method: "POST", body: JSON.stringify(body) }),
  updateStudent: (id: number, patch: { display_name?: string; timezone?: string; daily_new_target?: number }) =>
    api<UserOut>(`/admin/students/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  assign: (studentId: number, deckId: number, dailyNewTarget?: number | null) =>
    api<AssignmentOut>("/admin/assignments", {
      method: "POST",
      body: JSON.stringify({ student_id: studentId, deck_id: deckId, daily_new_target: dailyNewTarget ?? null }),
    }),
  assignClass: (deckId: number, dailyNewTarget?: number | null) =>
    api<AssignmentOut[]>("/admin/assignments/class", {
      method: "POST",
      body: JSON.stringify({ deck_id: deckId, daily_new_target: dailyNewTarget ?? null }),
    }),
};
