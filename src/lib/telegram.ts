import { File, Paths, UploadType } from "expo-file-system";
import { getBotToken, getChannelId } from "./settings";

const API_BASE = "https://api.telegram.org";
const JSON_TIMEOUT_MS = 60_000;
const UPLOAD_TIMEOUT_MS = 600_000;

// React Native fetch has no default timeout — a stalled connection would hang
// a queue worker forever. Abort manually.
async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function parseJsonResponse<T>(res: Response, fallbackMethod: string): Promise<T> {
  let json: TgApiResult<T> | null = null;
  try {
    json = JSON.parse(await res.text()) as TgApiResult<T>;
  } catch {}
  if (!json) {
    // Non-JSON body (captive portal, proxy garbage) must not carry an HTTP
    // status that callers interpret — e.g. useSetupStore wipes the saved
    // token on 401/404, which only a genuine Telegram JSON error may trigger.
    throw new TelegramError(
      0,
      `Invalid Telegram response for ${fallbackMethod} (HTTP ${res.status})`
    );
  }
  if (!json.ok) {
    const ra = json.parameters?.retry_after;
    throw new TelegramError(
      json.error_code ?? res.status,
      json.description ?? "Telegram request failed",
      typeof ra === "number" ? ra : undefined
    );
  }
  return json.result as T;
}

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

export interface TgVideo {
  file_id: string;
  file_unique_id: string;
  width: number;
  height: number;
  duration: number;
  mime_type?: string;
  file_size?: number;
  file_name?: string;
  thumbnail?: TgPhotoSize;
}

export interface TgMessage {
  message_id: number;
  date: number;
  chat: { id: number; type: string; title?: string; username?: string };
  photo?: TgPhotoSize[];
  document?: TgDocument;
  video?: TgVideo;
  caption?: string;
  caption_entities?: any[];
  text?: string;
  reply_to_message?: TgMessage;
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

async function call<T>(
  method: string,
  params?: Record<string, unknown>,
  tokenOverride?: string
): Promise<T> {
  const token = tokenOverride ?? (await getBotToken());
  if (!token) throw new TelegramError(401, "Bot token not configured");
  const res = await fetchWithTimeout(
    `${API_BASE}/bot${token}/${method}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params ?? {}),
    },
    JSON_TIMEOUT_MS
  );
  return parseJsonResponse<T>(res, method);
}

export async function getMe(tokenOverride?: string): Promise<TgUser> {
  return call<TgUser>("getMe", undefined, tokenOverride);
}

export async function getChat(chatId: string | number, tokenOverride?: string): Promise<any> {
  return call<any>("getChat", { chat_id: chatId }, tokenOverride);
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

// Plain-text status replies for remote control. HTML parse mode would force
// escaping every dynamic fragment — not worth it for bot-operator output.
export async function sendMessage(
  chatId: string | number,
  text: string,
  options: { replyToMessageId?: number; token?: string } = {}
): Promise<void> {
  try {
    await call(
      "sendMessage",
      {
        chat_id: String(chatId),
        text,
        // call() posts a JSON body — reply_parameters must be a nested
        // object here, NOT a JSON string (that form is only correct for
        // the multipart sendFile paths). A string yields a silent 400 and
        // every status reply would vanish.
        ...(options.replyToMessageId
          ? { reply_parameters: { message_id: options.replyToMessageId } }
          : {}),
      },
      options.token
    );
  } catch {
    // Status replies are best-effort — a failed reply must never crash the poll loop.
  }
}

export interface FileSendOptions {
  caption?: string;
  replyToMessageId?: number;
  filename?: string;
  mime?: string;
  messageThreadId?: number;
  token?: string;
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
    token: options.token,
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
    token: options.token,
    onProgress: options.onProgress,
    signal: options.signal,
  });
}

export async function sendVideo(
  chatId: string | number,
  fileUri: string,
  options: FileSendOptions & {
    duration?: number;
    width?: number;
    height?: number;
    supportsStreaming?: boolean;
  } = {}
): Promise<TgMessage> {
  const params: Record<string, string> = { chat_id: String(chatId) };
  if (options.caption) {
    params.caption = options.caption;
    params.parse_mode = "HTML";
  }
  if (options.replyToMessageId) {
    params.reply_parameters = JSON.stringify({ message_id: options.replyToMessageId });
  }
  if (options.duration && options.duration > 0) {
    params.duration = String(Math.round(options.duration / 1000));
  }
  if (options.width) params.width = String(options.width);
  if (options.height) params.height = String(options.height);
  if (options.supportsStreaming) params.supports_streaming = "true";
  return sendFileViaTask(chatId, "sendVideo", "video", fileUri, params, {
    filename: options.filename ?? "video.mp4",
    mime: options.mime ?? "video/mp4",
    token: options.token,
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
  file: {
    filename: string;
    mime: string;
    token?: string;
    onProgress?: (s: number, t: number) => void;
    signal?: AbortSignal;
  }
): Promise<TgMessage> {
  const token = file.token ?? (await getBotToken());
  if (!token) throw new TelegramError(401, "Bot token not configured");
  let gotBytes = false;
  let staged: File | null = null;
  let uploadUri = fileUri;
  try {
    const src = new File(fileUri);
    if (src.name !== file.filename || fileUri.startsWith("content://")) {
      // Two reasons to stage an exactly-named copy in cache: multipart part
      // names come from the file itself, and the native upload task can't
      // handle content:// source URIs (videos from MediaStore) — file://
      // copies upload fine, which is why photos (file://) work and videos
      // (content://) fail. Round 19 device-session root cause.
      const unique = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const dest = new File(Paths.cache, `pb_upload_${unique}_${file.filename}`);
      // File.copy is async (copySync is the sync variant). Awaiting it makes
      // the upload task see a complete staged file and avoids timestamp-path
      // collisions uploading a stale copy.
      await src.copy(dest);
      staged = dest;
      uploadUri = dest.uri;
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
      // uploadAsync has no timeout — a stalled native upload would hang a
      // queue worker forever. Race it against a hard timeout that cancels the
      // task; retry-vs-reraise is decided by gotBytes below.
      let timer: ReturnType<typeof setTimeout> | null = null;
      const result = await Promise.race([
        task.uploadAsync(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            task.cancel();
            reject(new Error(`Upload timed out after ${UPLOAD_TIMEOUT_MS / 1000}s`));
          }, UPLOAD_TIMEOUT_MS);
        }),
      ]).finally(() => {
        if (timer) clearTimeout(timer);
      });
      return parseTgResult(result.body, result.status);
    } finally {
      task.release();
    }
  } catch (e) {
    if (e instanceof TelegramError) throw e;
    if (gotBytes || file.signal?.aborted) throw e;
    // Retry once from a fresh cache copy. The old FormData-fetch fallback is
    // DEAD under expo/fetch (its convertFormData rejects RN-style {uri} parts
    // with "Unsupported FormDataPart implementation") and it masked whatever
    // the primary attempt failed with — a staged retry surfaces the real
    // error instead.
    let fallbackFile: File | null = null;
    try {
      fallbackFile = new File(Paths.cache, `pb_fallback_${Date.now()}_${file.filename}`);
      if (fallbackFile.exists) fallbackFile.delete();
      await new File(uploadUri).copy(fallbackFile);
      const task = new File(fallbackFile.uri).createUploadTask(`${API_BASE}/bot${token}/${method}`, {
        uploadType: UploadType.MULTIPART,
        fieldName,
        mimeType: file.mime,
        parameters: params,
        signal: file.signal,
      });
      try {
        let timer: ReturnType<typeof setTimeout> | null = null;
        const result = await Promise.race([
          task.uploadAsync(),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => {
              task.cancel();
              reject(new Error(`Upload timed out after ${UPLOAD_TIMEOUT_MS / 1000}s`));
            }, UPLOAD_TIMEOUT_MS);
          }),
        ]).finally(() => {
          if (timer) clearTimeout(timer);
        });
        return parseTgResult(result.body, result.status);
      } finally {
        task.release();
      }
    } catch (e2) {
      if (e2 instanceof TelegramError) throw e2;
      // Chain the ORIGINAL failure — the retry only proves the copy/re-upload
      // route also failed (e.g. source genuinely unreadable).
      throw new Error(`${e instanceof Error ? e.message : String(e)} (retry: ${e2 instanceof Error ? e2.message : String(e2)})`);
    } finally {
      if (fallbackFile) {
        try { fallbackFile.delete(); } catch {}
      }
    }
  } finally {
    if (staged) {
      try { staged.delete(); } catch {}
    }
  }
}

function parseTgResult<T>(body: string, status: number): T {
  let json: TgApiResult<T> | null = null;
  try {
    json = JSON.parse(body) as TgApiResult<T>;
  } catch {}
  if (!json) throw new TelegramError(0, `Invalid Telegram response (HTTP ${status})`);
  if (!json.ok) {
    const ra = json.parameters?.retry_after;
    throw new TelegramError(
      json.error_code ?? status,
      json.description ?? "Upload failed",
      typeof ra === "number" ? ra : undefined
    );
  }
  return json.result as T;
}

async function uploadForm(
  method: string,
  form: FormData,
  tokenOverride?: string
): Promise<TgMessage> {
  const token = tokenOverride ?? (await getBotToken());
  if (!token) throw new TelegramError(401, "Bot token not configured");
  const res = await fetchWithTimeout(
    `${API_BASE}/bot${token}/${method}`,
    {
      method: "POST",
      body: form,
    },
    UPLOAD_TIMEOUT_MS
  );
  return parseTgResult<TgMessage>(await res.text(), res.status);
}

export async function createForumTopic(
  chatId: string | number,
  name: string,
  tokenOverride?: string
): Promise<{ message_thread_id: number; name: string } | null> {
  try {
    return await call<{ message_thread_id: number; name: string }>(
      "createForumTopic",
      {
        chat_id: chatId,
        name: name.slice(0, 128),
      },
      tokenOverride
    );
  } catch {
    return null;
  }
}

export interface MediaGroupItem {
  uri: string;
  caption?: string;
  filename?: string;
}

export async function sendMediaGroup(
  chatId: string | number,
  items: MediaGroupItem[],
  options: { messageThreadId?: number; token?: string } = {}
): Promise<TgMessage[] | null> {
  if (items.length === 0) return [];
  const token = options.token ?? (await getBotToken());
  if (!token) throw new TelegramError(401, "Bot token not configured");
  const form = new FormData();
  form.append("chat_id", String(chatId));
  if (options.messageThreadId) {
    form.append("message_thread_id", String(options.messageThreadId));
  }
  const media = items.map((it, i) => ({
    type: "photo",
    media: `attach://file${i}`,
    ...(it.caption ? { caption: it.caption, parse_mode: "HTML" } : {}),
  }));
  form.append("media", JSON.stringify(media));
  items.forEach((it, i) => {
    form.append(`file${i}`, {
      uri: it.uri,
      name: it.filename ?? `photo_${i}.jpg`,
      type: "image/jpeg",
    } as any);
  });
  try {
    const res = await fetchWithTimeout(
      `${API_BASE}/bot${token}/sendMediaGroup`,
      {
        method: "POST",
        body: form,
      },
      UPLOAD_TIMEOUT_MS
    );
    return parseTgResult<TgMessage[]>(await res.text(), res.status);
  } catch (e) {
    if (e instanceof TelegramError) throw e;
    return null;
  }
}

export async function deleteMessage(
  chatId: string | number,
  messageId: number,
  tokenOverride?: string
): Promise<boolean> {
  try {
    await call("deleteMessage", { chat_id: chatId, message_id: messageId }, tokenOverride);
    return true;
  } catch {
    return false;
  }
}

export async function setMessageReaction(
  chatId: string | number,
  messageId: number,
  emoji: string | null,
  tokenOverride?: string
): Promise<boolean> {
  try {
    const reaction =
      emoji === null
        ? []
        : [{ type: "emoji", emoji }];
    await call(
      "setMessageReaction",
      {
        chat_id: chatId,
        message_id: messageId,
        reaction,
      },
      tokenOverride
    );
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

export async function getFile(fileId: string, tokenOverride?: string): Promise<FileResult> {
  return call<FileResult>("getFile", { file_id: fileId }, tokenOverride);
}

export async function getUpdates(offset: number, timeout = 0): Promise<TgUpdate[]> {
  const token = await getBotToken();
  if (!token) throw new TelegramError(401, "Bot token not configured");
  const url =
    `${API_BASE}/bot${token}/getUpdates?offset=${offset}&timeout=${timeout}` +
    `&allowed_updates=${encodeURIComponent(JSON.stringify(["channel_post", "message"]))}`;
  const res = await fetchWithTimeout(
    url,
    { method: "GET" },
    (timeout + 30) * 1000
  );
  return parseJsonResponse<TgUpdate[]>(res, "getUpdates");
}

export async function downloadFile(
  fileId: string,
  destUri: string,
  tokenOverride?: string
): Promise<void> {
  const token = tokenOverride ?? (await getBotToken());
  if (!token) throw new TelegramError(401, "Bot token not configured");
  const info = await getFile(fileId, token);
  if (!info.file_path) throw new TelegramError(400, "No file_path returned by Telegram");
  const url = `${API_BASE}/file/bot${token}/${info.file_path}`;
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
