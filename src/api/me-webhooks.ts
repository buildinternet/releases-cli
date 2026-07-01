import type { UserWebhookFormat, WebhookDeliveryRow } from "@buildinternet/releases-api-types";
import { apiFetch } from "./core.js";

/**
 * Self-serve `/v1/me/webhooks` wire shapes. Defined locally until they ship in
 * `@buildinternet/releases-api-types` (follows the admin `webhooks.ts` pattern).
 */
export type UserWebhookScope = "org" | "follows";
export type UserWebhookReleaseTypeFilter = "feature" | "rollup";

export type WebhookDeliveryHealth =
  | "never_delivered"
  | "healthy"
  | "degraded"
  | "failing"
  | "paused"
  | "auto_paused";

export interface UserWebhookSubscription {
  id: string;
  userId: string;
  scope: UserWebhookScope;
  orgId: string | null;
  url: string;
  sourceId: string | null;
  productId: string | null;
  releaseType: UserWebhookReleaseTypeFilter | null;
  enabled: boolean;
  description: string | null;
  secretVersion: number;
  createdAt: string;
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  lastErrorMsg: string | null;
  consecutiveFailures: number;
  disabledReason: string | null;
  failureStreakStartedAt: string | null;
  deliveryHealth: WebhookDeliveryHealth;
  deliveryHealthSummary: string;
  format?: UserWebhookFormat;
}

export interface UserWebhookListItem extends Omit<UserWebhookSubscription, "userId"> {
  orgSlug: string | null;
  orgName: string | null;
  sourceSlug: string | null;
  sourceName: string | null;
  productSlug: string | null;
  productName: string | null;
}

export interface CreateUserWebhookResponse extends UserWebhookListItem {
  /** Present for json-format webhooks; absent for slack-format (the URL is the secret). */
  signingKey?: string;
}

export interface CreateUserWebhookInput {
  url: string;
  scope?: UserWebhookScope;
  orgSlug?: string;
  orgId?: string;
  sourceSlug?: string;
  sourceId?: string;
  productSlug?: string;
  productId?: string;
  releaseType?: UserWebhookReleaseTypeFilter;
  description?: string | null;
  format?: UserWebhookFormat;
}

/** List the signed-in user's webhook subscriptions. */
export async function listMyWebhooks(opts?: { enabled?: boolean }): Promise<UserWebhookListItem[]> {
  const params = new URLSearchParams();
  if (opts?.enabled !== undefined) params.set("enabled", String(opts.enabled));
  const qs = params.toString();
  const res = await apiFetch<{ subscriptions: UserWebhookListItem[] } | null>(
    `/v1/me/webhooks${qs ? `?${qs}` : ""}`,
  );
  return res?.subscriptions ?? [];
}

/** Register a self-serve webhook. The `signingKey` is shown once. */
export async function createMyWebhook(
  input: CreateUserWebhookInput,
): Promise<CreateUserWebhookResponse> {
  return apiFetch<CreateUserWebhookResponse>(`/v1/me/webhooks`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/** Read one owned subscription. Returns null on 404. */
export async function getMyWebhook(id: string): Promise<UserWebhookSubscription | null> {
  return apiFetch<UserWebhookSubscription | null>(`/v1/me/webhooks/${encodeURIComponent(id)}`);
}

export type UpdateMyWebhookInput = {
  url?: string;
  description?: string | null;
  enabled?: boolean;
  sourceSlug?: string;
  sourceId?: string | null;
  productSlug?: string;
  productId?: string | null;
  releaseType?: UserWebhookReleaseTypeFilter | null;
  format?: UserWebhookFormat;
};

export async function updateMyWebhook(
  id: string,
  fields: UpdateMyWebhookInput,
): Promise<UserWebhookSubscription> {
  return apiFetch<UserWebhookSubscription>(`/v1/me/webhooks/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(fields),
  });
}

export async function deleteMyWebhook(id: string): Promise<void> {
  await apiFetch<void>(`/v1/me/webhooks/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function rotateMyWebhookSecret(
  id: string,
): Promise<{ secretVersion: number; signingKey: string }> {
  return apiFetch<{ secretVersion: number; signingKey: string }>(
    `/v1/me/webhooks/${encodeURIComponent(id)}/rotate-secret`,
    { method: "POST" },
  );
}

export async function testMyWebhook(id: string): Promise<{ enqueued: true; eventId: string }> {
  return apiFetch<{ enqueued: true; eventId: string }>(
    `/v1/me/webhooks/${encodeURIComponent(id)}/test`,
    { method: "POST" },
  );
}

export async function getMyWebhookDeliveries(
  id: string,
  opts?: { failed?: boolean; limit?: number },
): Promise<WebhookDeliveryRow[]> {
  const params = new URLSearchParams();
  if (opts?.failed) params.set("failed", "true");
  if (opts?.limit !== undefined) params.set("limit", String(opts.limit));
  const qs = params.toString();
  const res = await apiFetch<{ data?: WebhookDeliveryRow[] } | null>(
    `/v1/me/webhooks/${encodeURIComponent(id)}/deliveries${qs ? `?${qs}` : ""}`,
  );
  return res?.data ?? [];
}
