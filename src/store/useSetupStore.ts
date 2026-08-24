import { create } from "zustand";
import {
  getBotToken,
  setBotToken,
  getChannelId,
  setChannelId,
} from "../lib/settings";
import { getMe, getChat, detectChannelFromUpdates, TgUser } from "../lib/telegram";
import { getDb } from "../lib/db";
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
  initialize: () => Promise<void>;
  verifyAndSave: (token: string) => Promise<boolean>;
  saveChannel: (channelId: string) => Promise<boolean>;
  detectChannel: () => Promise<{ id: string; title?: string } | null>;
  requestMediaPermissions: () => Promise<boolean>;
  reset: () => Promise<void>;
}

export const useSetupStore = create<SetupState>((set, get) => ({
  step: "loading",
  token: null,
  channelId: null,
  channelTitle: null,
  botUsername: null,
  busy: false,
  error: null,

  initialize: async () => {
    set({ busy: true, error: null });
    try {
      await getDb();
      const token = await getBotToken();
      const channelId = await getChannelId();
      if (token && channelId) {
        let botUsername: string | null = null;
        let channelTitle: string | null = null;
        try {
          const me: TgUser = await getMe();
          botUsername = me.username ?? null;
        } catch {
          set({
            step: "unconfigured",
            token: null,
            channelId: null,
            busy: false,
          });
          await setBotToken(null);
          return;
        }
        try {
          const chat = await getChat(channelId);
          channelTitle = chat.title ?? chat.username ?? channelId;
        } catch {
          channelTitle = channelId;
        }
        set({
          step: "ready",
          token,
          channelId,
          botUsername,
          channelTitle,
          busy: false,
        });
      } else {
        set({ step: "unconfigured", token, channelId, busy: false });
      }
    } catch (e: any) {
      set({ step: "error", error: e?.message ?? "Init failed", busy: false });
    }
  },

  verifyAndSave: async (token: string) => {
    set({ busy: true, error: null });
    try {
      const me = await getMeWithToken(token);
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
      set({
        channelId: channelId.trim(),
        channelTitle: chat.title ?? chat.username ?? channelId,
        step: "ready",
        busy: false,
        error: null,
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
    });
  },
}));

async function getMeWithToken(token: string): Promise<TgUser> {
  const saved = await getBotToken();
  await setBotToken(token);
  try {
    return await getMe();
  } catch (e) {
    await setBotToken(saved ?? null);
    throw e;
  }
}
