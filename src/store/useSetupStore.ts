import { create } from "zustand";
import {
  getBotToken,
  setBotToken,
  getChannelId,
  setChannelId,
} from "../lib/settings";
import { getMe, getChat, detectChannelFromUpdates, TelegramError, TgUser } from "../lib/telegram";
import { getDb, getStats } from "../lib/db";
import { findChannelBackupOffer, type BackupOffer } from "../lib/backup";
import { ensurePermissions } from "../lib/sync";

export type SetupStep = "loading" | "unconfigured" | "ready" | "error";

interface SetupState {
  step: SetupStep;
  token: string | null;
  channelId: string | null;
  channelTitle: string | null;
  botUsername: string | null;
  busy: boolean;
  error: string | null;
  migrationOffer: BackupOffer | null;
  initialize: () => Promise<void>;
  /** Re-run the non-blocking bot/channel metadata lookup (Settings mount, foreground). */
  refreshMetadata: () => void;
  verifyAndSave: (token: string) => Promise<boolean>;
  saveChannel: (channelId: string) => Promise<boolean>;
  detectChannel: () => Promise<{ id: string; title?: string } | null>;
  requestMediaPermissions: () => Promise<boolean>;
  reset: () => Promise<void>;
  finishMigration: () => void;
}

type SetupSet = (partial: Partial<SetupState>) => void;

/**
 * Bot/channel metadata refresh, deliberately off the startup path.
 *
 * `initialize()` must never await Telegram: a stalled connection used to hold
 * the splash for the full JSON_TIMEOUT_MS (60 s) — measured as a 61 s cold
 * start on hardware (2026-11-17). This runs after the app is already usable and
 * fills in the username and channel title when the network answers.
 */
async function refreshBotMetadata(set: SetupSet, channelId: string): Promise<void> {
  try {
    const me: TgUser = await getMe();
    if (me?.username) set({ botUsername: me.username });
  } catch (e) {
    if (e instanceof TelegramError && (e.code === 401 || e.code === 404)) {
      // Token genuinely rejected — clear it and force re-setup.
      set({ step: "unconfigured", token: null, channelId: null, busy: false });
      await setBotToken(null);
      return;
    }
    // Transient network failure — keep the saved config and degrade
    // gracefully; uploads will surface errors with retry/backoff.
  }
  try {
    const chat = await getChat(channelId);
    const title = chat.title ?? chat.username ?? channelId;
    if (title) set({ channelTitle: title });
  } catch {
    // Keep the provisional title (the channel id).
  }
}

export const useSetupStore = create<SetupState>((set, get) => ({
  step: "loading",
  token: null,
  channelId: null,
  channelTitle: null,
  botUsername: null,
  busy: false,
  error: null,
  migrationOffer: null,

  initialize: async () => {
    set({ busy: true, error: null });
    try {
      await getDb();
      const token = await getBotToken();
      const channelId = await getChannelId();
      if (token && channelId) {
        // Never gate the splash on Telegram. The saved token + channel id are
        // all the app needs to run; bot/channel metadata is cosmetic. Doing
        // these round trips inline meant a stalled connection held the app on
        // "Starting PhotogramBot…" until JSON_TIMEOUT_MS (60 s) elapsed — the
        // 61 s cold start measured on hardware on 2026-11-17.
        set({
          step: "ready",
          token,
          channelId,
          // Provisional title (the same fallback the old code used when a
          // lookup failed); replaced in place when the refresh lands.
          channelTitle: channelId,
          busy: false,
        });
        void refreshBotMetadata(set, channelId);
      } else {
        set({ step: "unconfigured", token, channelId, busy: false });
      }
    } catch (e: any) {
      set({ step: "error", error: e?.message ?? "Init failed", busy: false });
    }
  },

  refreshMetadata: () => {
    const { token, channelId } = get();
    // A cold start whose network was down leaves the username/title unknown
    // forever otherwise: the old blocking code retried on every launch, this
    // non-blocking path has to be re-invoked by whoever can observe the app
    // becoming usable again (Settings mount / returning to the foreground).
    if (token && channelId) void refreshBotMetadata(set, channelId);
  },

  verifyAndSave: async (token: string) => {
    set({ busy: true, error: null });
    try {
      const me = await getMe(token);
      await setBotToken(token);
      set({ token, botUsername: me.username ?? null, busy: false });
      if (get().channelId) {
        set({ step: "ready" });
      }
      return true;
    } catch (e: any) {
      set({ error: e?.message ?? "Invalid bot token", busy: false });
      return false;
    }
  },

  saveChannel: async (channelId: string) => {
    set({ busy: true, error: null });
    try {
      const chat = await getChat(channelId.trim());
      await setChannelId(channelId.trim());
      // Fresh-install migration: an empty library plus a pinned channel
      // backup means this is a new phone that can restore instead of
      // starting over. Hold the setup wizard open for the restore step.
      let migrationOffer: BackupOffer | null = null;
      try {
        const stats = await getStats();
        if (stats.total === 0) {
          migrationOffer = await findChannelBackupOffer();
        }
      } catch {}
      set({
        channelId: channelId.trim(),
        channelTitle: chat.title ?? chat.username ?? channelId,
        step: migrationOffer ? "unconfigured" : "ready",
        busy: false,
        error: null,
        migrationOffer,
      });
      return true;
    } catch (e: any) {
      set({
        error:
          e?.message ??
          "Could not reach this chat. Make sure the bot is an admin there.",
        busy: false,
      });
      return false;
    }
  },

  detectChannel: async () => {
    set({ busy: true, error: null });
    try {
      const found = await detectChannelFromUpdates();
      set({ busy: false });
      return found;
    } catch (e: any) {
      set({ busy: false, error: e?.message ?? "Detection failed" });
      return null;
    }
  },

  requestMediaPermissions: async () => {
    return ensurePermissions();
  },

  reset: async () => {
    await setBotToken(null);
    await setChannelId(null);
    set({
      step: "unconfigured",
      token: null,
      channelId: null,
      channelTitle: null,
      botUsername: null,
      error: null,
      migrationOffer: null,
    });
  },

  finishMigration: () => {
    set({ migrationOffer: null, step: "ready" });
  },
}));
