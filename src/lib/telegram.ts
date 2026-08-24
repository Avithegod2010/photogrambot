import { File, Paths, UploadType } from "expo-file-system";
import { getBotToken, getChannelId } from "./settings";

const API_BASE = "https://api.telegram.org";

export interface TgApiResult<T> {
  ok: boolean;
  result?: T;
  error_code?: number;
  description?: string;
  parameters?: { retry_after?: number };
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
  retryAfter?: number;
  constructor(code: number, description: string, retryAfter?: number) {
    super(description);
    this.code = code;
    this.retryAfter = retryAfter;
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
    const ra = json.parameters?.retry_after;
    throw new TelegramError(
      json.error_code ?? 0,
      json.description ?? "Unknown Telegram error",
      typeof ra === "number" ? ra : undefined
    );
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

export interface FileSendOptions {
  caption?: string;
  replyToMessageId?: number;
  filename?: string;
  mime?: string;
  messageThreadId?: number;
  onProgress?: (sentBytes: number, totalBytes: number) => void;
  signal?: AbortSignal;
}

export async function sendPhoto(
  chatId: string | number,
  fileUri: string,
  options: FileSendOptions = {}
): Promise<TgMessage> {
  const params: Record<string, string> = { chat_id: String(chatId) };
  if (options.caption) {
    params.caption = options.caption;
    params.parse_mode = "HTML";
  }
  if (options.replyToMessageId) {
    params.reply_parameters = JSON.stringify({ message_id: options.replyToMessageId });
  }
  return sendFileViaTask(chatId, "sendPhoto", "photo", fileUri, params, {
    filename: options.filename ?? "preview.jpg",
    mime: "image/jpeg",
    onProgress: options.onProgress,
    signal: options.signal,
  });
}

export async function sendDocument(
  chatId: string | number,
  fileUri: string,
  options: FileSendOptions = {}
): Promise<TgMessage> {
  const params: Record<string, string> = {
    chat_id: String(chatId),
    disable_content_type_detection: "true",
  };
  if (options.caption) {
    params.caption = options.caption;
    params.parse_mode = "HTML";
  }
  if (options.replyToMessageId) {
    params.reply_parameters = JSON.stringify({ message_id: options.replyToMessageId });
  }
  if (options.messageThreadId) {
    params.message_thread_id = String(options.messageThreadId);
  }
  return sendFileViaTask(chatId, "sendDocument", "document", fileUri, params, {
    filename: options.filename ?? "photo.jpg",
    mime: options.mime ?? "application/octet-stream",
    onProgress: options.onProgress,
    signal: options.signal,
  });
}

async function sendFileViaTask(
  chatId: string | number,
  method: string,
  fieldName: string,
  fileUri: string,
  params: Record<string, string>,
  file: { filename: string; mime: string; onProgress?: (s: number, t: number) => void; signal?: AbortSignal }
): Promise<TgMessage> {
  const token = await getBotToken();
  if (!token) throw new TelegramError(401, "Bot token not configured");
  let gotBytes = false;
  let staged: File | null = null;
  let uploadUri = fileUri;
  try {
    const src = new File(fileUri);
    if (src.name !== file.filename) {
      // Multipart part names come from the file itself — stage an exactly-named
      // copy in cache so Telegram shows the right document name.
      const dest = new File(Paths.cache, `pb_upload_${Date.now()}_${file.filename}`);
      if (!dest.exists) {
        src.copy(dest);
        staged = dest;
        uploadUri = dest.uri;
      }
    }
    const task = new File(uploadUri).createUploadTask(`${API_BASE}/bot${token}/${method}`, {
      uploadType: UploadType.MULTIPART,
      fieldName,
      mimeType: file.mime,
      parameters: params,
      onProgress: file.onProgress
        ? (d) => {
            gotBytes = true;
            file.onProgress!(d.bytesSent, d.totalBytes);
          }
        : undefined,
      signal: file.signal,
    });
    try {
      const result = await task.uploadAsync();
      return parseTgResult(result.body, result.status);
    } finally {
      task.release();
    }
  } catch (e) {
    if (e instanceof TelegramError) throw e;
    if (gotBytes || file.signal?.aborted) throw e;
    // Local read failure (e.g. unreadable content:// URI) — fall back to FormData fetch.
    const form = new FormData();
    for (const [k, v] of Object.entries(params)) form.append(k, v);
    form.append(fieldName, { uri: fileUri, name: file.filename, type: file.mime } as any);
    return uploadForm(method, form);
  } finally {
    if (staged) {
      try { staged.delete(); } catch {}
    }
  }
}

function parseTgResult(body: string, status: number): TgMessage {
  let json: TgApiResult<TgMessage> | null = null;
  try {
    json = JSON.parse(body) as TgApiResult<TgMessage>;
  } catch {}
  if (!json) throw new TelegramError(status || 0, `Invalid Telegram response (HTTP ${status})`);
  if (!json.ok) {
    const ra = json.parameters?.retry_after;
    throw new TelegramError(
      json.error_code ?? status,
      json.description ?? "Upload failed",
      typeof ra === "number" ? ra : undefined
    );
  }
  return json.result as TgMessage;
}

async function uploadForm(method: string, form: FormData): Promise<TgMessage> {
  const token = await getBotToken();
  if (!token) throw new TelegramError(401, "Bot token not configured");
  const res = await fetch(`${API_BASE}/bot${token}/${method}`, {
    method: "POST",
    body: form,
  });
  return parseTgResult(await res.text(), res.status);
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
