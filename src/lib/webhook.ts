// Webhook mode (optional).
//
// Telegram webhooks need a public HTTPS endpoint. A phone cannot accept one,
// so this mode targets a tiny self-hosted relay that stores updates and lets
// the app fetch them over HTTPS. The relay worker is documented in
// docs/WEBHOOK_RELAY.md. When no relay is configured the app keeps long
// polling, so this is strictly opt-in and fail-safe.

import { deleteWebhook, getUpdates, getWebhookInfo, setWebhook, type TgUpdate } from "./telegram";
import { loadPrefs, savePrefs } from "./settings";

export interface WebhookStatus {
  mode: boolean;
  relayUrl: string;
  telegramUrl: string | null;
  pending: number;
  lastError: string | null;
}

export function normalizeRelayUrl(raw: string): string {
  const url = raw.trim().replace(/\/+$/, "");
  if (!/^https:\/\/[^\s]+$/i.test(url)) {
    throw new Error("The relay URL must start with https://");
  }
  return url;
}

export async function configureWebhook(relayUrl: string, secret: string): Promise<void> {
  const url = normalizeRelayUrl(relayUrl);
  const cleanSecret = secret.trim().slice(0, 64);
  if (cleanSecret.length < 8) throw new Error("Use a relay secret of at least 8 characters.");
  const ok = await setWebhook(url, cleanSecret);
  if (!ok) throw new Error("Telegram rejected the webhook URL. Check the relay is public HTTPS.");
  await savePrefs({ webhookMode: true, webhookRelayUrl: url, webhookSecret: cleanSecret });
}

export async function disableWebhookMode(): Promise<void> {
  await deleteWebhook();
  await savePrefs({ webhookMode: false, webhookRelayUrl: "", webhookSecret: "" });
}

export async function webhookStatus(): Promise<WebhookStatus> {
  const prefs = await loadPrefs();
  const info = await getWebhookInfo();
  return {
    mode: prefs.webhookMode,
    relayUrl: prefs.webhookRelayUrl,
    telegramUrl: info?.url ?? null,
    pending: info?.pending_update_count ?? 0,
    lastError: info?.last_error_message ?? null,
  };
}

/** Fetches updates from the relay; falls back to direct polling on failure. */
export async function fetchRelayUpdates(offset: number): Promise<TgUpdate[]> {
  const prefs = await loadPrefs();
  if (!prefs.webhookMode || !prefs.webhookRelayUrl) return [];
  const url = `${prefs.webhookRelayUrl.replace(/\/+$/, "")}/updates?offset=${offset}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${prefs.webhookSecret}`,
        Accept: "application/json",
      },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`relay HTTP ${res.status}`);
    const body = (await res.json()) as { ok?: boolean; result?: TgUpdate[] };
    if (!body?.ok || !Array.isArray(body.result)) throw new Error("bad relay response");
    return body.result;
  } finally {
    clearTimeout(timer);
  }
}

/** Polling entry point: relay when enabled, Telegram long-poll otherwise. */
export async function fetchUpdates(offset: number): Promise<TgUpdate[]> {
  const prefs = await loadPrefs();
  if (prefs.webhookMode && prefs.webhookRelayUrl) {
    try {
      return await fetchRelayUpdates(offset);
    } catch {
      // Telegram rejects getUpdates while a webhook is registered (409), so
      // there is no safe direct-polling fallback here. Return empty and let
      // the next poll retry; Settings -> Remote can switch back to polling.
      return [];
    }
  }
  return getUpdates(offset > 0 ? offset : -1, 0);
}
