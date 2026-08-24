import { getBotToken, getChannelId } from "./settings";

const API_BASE = "https://api.telegram.org";

export interface TgApiResult<T> {
  ok: boolean;
  result?: T;
  error_code?: number;
  description?: string;
}

export interface TgPhotoSize {
  file_id: string;
  file_unique_id: string;
  width: number;
  height: number;
  file_size?: number;
}

export interface TgDocument {
  file_id: string;
  file_unique_id: string;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
  thumbnail?: TgPhotoSize;
}

export interface TgMessage {
  message_id: number;
  date: number;
  chat: { id: number; type: string; title?: string; username?: string };
  photo?: TgPhotoSize[];
  document?: TgDocument;
  caption?: string;
  caption_entities?: any[];
}

export interface TgUpdate {
  update_id: number;
  channel_post?: TgMessage;
  message?: TgMessage;
}

export interface TgUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  username?: string;
}

export class TelegramError extends Error {
  code: number;
  constructor(code: number, description: string) {
    super(description);
    this.code = code;
  }
}

async function call<T>(method: string, params?: Record<string, unknown>): Promise<T> {
  const token = await getBotToken();
  if (!token) throw new TelegramError(401, "Bot token not configured");
  const res = await fetch(`${API_BASE}/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params ?? {}),
  });
  const json = (await res.json()) as TgApiResult<T>;
  if (!json.ok) {
    throw new TelegramError(json.error_code ?? 0, json.description ?? "Unknown Telegram error");
  }
  return json.result as T;
}

export async function getMe(): Promise<TgUser> {
  return call<TgUser>("getMe");
}

export async function getChat(chatId: string | number): Promise<any> {
  return call<any>("getChat", { chat_id: chatId });
}

export async function getChatPinnedMessage(chatId: string | number): Promise<TgMessage | null> {
  try {
    const chat = await getChat(chatId);
    return chat.pinned_message ?? null;
  } catch {
    return null;
  }
}

export async function pinChatMessage(chatId: string | number, messageId: number): Promise<boolean> {
  try {
    await call("pinChatMessage", { chat_id: chatId, message_id: messageId });
    return true;
  } catch {
    return false;
  }
}

export async function unpinChatMessage(chatId: string | number, messageId: number): Promise<void> {
  try {
    await call("unpinChatMessage", { chat_id: chatId, message_id: messageId });
  } catch {
    return;
  }
}

export async function sendPhoto(
  chatId: string | number,
  fileUri: string,
  options: {
    caption?: string;
    replyToMessageId?: number;
    filename?: string;
  } = {}
): Promise<TgMessage> {
  const form = new FormData();
  form.append("chat_id", String(chatId));
  if (options.caption) {
    form.append("caption", options.caption);
    form.append("parse_mode", "HTML");
  }
  if (options.replyToMessageId) {
    form.append("reply_parameters", JSON.stringify({ message_id: options.replyToMessageId }));
  }
  form.append("photo", {
    uri: fileUri,
    name: options.filename ?? "preview.jpg",
    type: "image/jpeg",
  } as any);
  return uploadForm("sendPhoto", form);
}

export async function sendDocument(
  chatId: string | number,
  fileUri: string,
  options: {
    caption?: string;
    filename?: string;
    mime?: string;
    replyToMessageId?: number;
    messageThreadId?: number;
  } = {}
): Promise<TgMessage> {
  const form = new FormData();
  form.append("chat_id", String(chatId));
  if (options.caption) {
    form.append("caption", options.caption);
    form.append("parse_mode", "HTML");
  }
  form.append("disable_content_type_detection", "true");
  if (options.replyToMessageId) {
    form.append("reply_parameters", JSON.stringify({ message_id: options.replyToMessageId }));
  }
  if (options.messageThreadId) {
    form.append("message_thread_id", String(options.messageThreadId));
  }
  form.append("document", {
    uri: fileUri,
    name: options.filename ?? "photo.jpg",
    type: options.mime ?? "application/octet-stream",
  } as any);
  return uploadForm("sendDocument", form);
}

async function uploadForm(method: string, form: FormData): Promise<TgMessage> {
  const token = await getBotToken();
  if (!token) throw new TelegramError(401, "Bot token not configured");
  const res = await fetch(`${API_BASE}/bot${token}/${method}`, {
    method: "POST",
    body: form,
  });
  const json = (await res.json()) as TgApiResult<TgMessage>;
  if (!json.ok) {
    throw new TelegramError(json.error_code ?? 0, json.description ?? "Upload failed");
  }
  return json.result as TgMessage;
}

export async function deleteMessage(chatId: string | number, messageId: number): Promise<boolean> {
  try {
    await call("deleteMessage", { chat_id: chatId, message_id: messageId });
    return true;
  } catch {
    return false;
  }
}

export async function setMessageReaction(
  chatId: string | number,
  messageId: number,
  emoji: string | null
): Promise<boolean> {
  try {
    const reaction =
      emoji === null
        ? []
        : [{ type: "emoji", emoji }];
    await call("setMessageReaction", {
      chat_id: chatId,
      message_id: messageId,
      reaction,
    });
    return true;
  } catch {
    return false;
  }
}

export interface FileResult {
  file_id: string;
  file_unique_id: string;
  file_size?: number;
  file_path?: string;
}

export async function getFile(fileId: string): Promise<FileResult> {
  return call<FileResult>("getFile", { file_id: fileId });
}

export async function getUpdates(offset: number, timeout = 0): Promise<TgUpdate[]> {
  const token = await getBotToken();
  if (!token) throw new TelegramError(401, "Bot token not configured");
  const url =
    `${API_BASE}/bot${token}/getUpdates?offset=${offset}&timeout=${timeout}` +
    `&allowed_updates=${encodeURIComponent(JSON.stringify(["channel_post", "message"]))}`;
  const res = await fetch(url);
  const json = (await res.json()) as TgApiResult<TgUpdate[]>;
  if (!json.ok) {
    throw new TelegramError(json.error_code ?? 0, json.description ?? "getUpdates failed");
  }
  return json.result ?? [];
}

export async function downloadFile(fileId: string, destUri: string): Promise<void> {
  const token = await getBotToken();
  if (!token) throw new TelegramError(401, "Bot token not configured");
  const info = await getFile(fileId);
  if (!info.file_path) throw new TelegramError(400, "No file_path returned by Telegram");
  const url = `${API_BASE}/file/bot${token}/${info.file_path}`;
  const { File } = await import("expo-file-system");
  const dest = new File(destUri);
  if (dest.exists) dest.delete();
  await File.downloadFileAsync(url, dest, { idempotent: true });
}

export async function detectChannelFromUpdates(): Promise<{ id: string; title?: string } | null> {
  const updates = await getUpdates(-1, 0);
  for (let i = updates.length - 1; i >= 0; i--) {
    const u = updates[i];
    const msg = u.channel_post ?? u.message;
    if (!msg) continue;
    if (msg.chat.type === "channel" || msg.chat.type === "supergroup" || msg.chat.type === "group") {
      return { id: String(msg.chat.id), title: msg.chat.title };
    }
  }
  return null;
}
