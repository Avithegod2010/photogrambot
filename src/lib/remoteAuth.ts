// Remote-control authorization (pure).
//
// Three roles, narrowly scoped:
//   read  - status/report/search only
//   write - sync, pause/resume, favorite, album, restore
//   admin - delete, wipe, revoke, merge
//
// Channel posts remain the owner's implicit admin path. Private-chat commands
// are accepted only from ids in the allowlist.

export type RemoteRole = "read" | "write" | "admin";

export interface RemoteAdmin {
  id: number;
  name?: string;
  role: RemoteRole;
}

const ROLE_RANK: Record<RemoteRole, number> = { read: 0, write: 1, admin: 2 };

export function isRemoteRole(value: unknown): value is RemoteRole {
  return value === "read" || value === "write" || value === "admin";
}

export function roleAtLeast(role: RemoteRole, needed: RemoteRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[needed];
}

export const COMMAND_ROLES: Record<string, RemoteRole> = {
  "/status": "read",
  "/stats": "read",
  "/ping": "read",
  "/help": "read",
  "/last": "read",
  "/find": "read",
  "/search": "read",
  "/queue": "read",
  "/devices": "read",
  "/sync": "write",
  "/pause": "write",
  "/resume": "write",
  "/favorite": "write",
  "/album": "write",
  "/restore": "write",
  "/delete": "admin",
  "/wipe": "admin",
  "/revoke": "admin",
  "/unrevoke": "admin",
};

export function requiredRoleForCommand(cmd: string): RemoteRole | null {
  return COMMAND_ROLES[cmd.toLowerCase()] ?? null;
}

/** Parses the persisted pref defensively; drops malformed entries. */
export function parseRemoteAdmins(value: unknown): RemoteAdmin[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<number>();
  const out: RemoteAdmin[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const id = Number((entry as any).id);
    if (!Number.isSafeInteger(id) || id <= 0 || seen.has(id)) continue;
    const role = (entry as any).role;
    seen.add(id);
    out.push({
      id,
      role: isRemoteRole(role) ? role : "read",
      name:
        typeof (entry as any).name === "string"
          ? String((entry as any).name).slice(0, 40)
          : undefined,
    });
  }
  return out.slice(0, 50);
}

export function findAdmin(
  admins: RemoteAdmin[],
  userId: number | null | undefined
): RemoteAdmin | null {
  if (!userId) return null;
  return admins.find((a) => a.id === userId) ?? null;
}

/**
 * Who is speaking, as far as the bot can tell from one update.
 *
 * `chatType` is Telegram's `msg.chat.type`; `isDestinationChat` says whether
 * that chat is the one configured in setup; `verifiedChatAdmin` is the result
 * of `getChatAdministrators` for the destination chat (only meaningful when the
 * update is a plain `message` in a channel — channel posts carry no `from`).
 */
export interface InboundIdentity {
  chatType: string;
  isChannelPost: boolean;
  isDestinationChat: boolean;
  fromId?: number | null;
  admins: RemoteAdmin[];
  verifiedChatAdmin: boolean;
}

/**
 * Resolves the role an inbound message may act with.
 *
 * The destination chat used to be trusted unconditionally, on the argument that
 * "only channel admins can post in the setup". That is true of a channel and
 * false of a group or supergroup — setup accepts either — so every member of a
 * group destination was silently granted `admin` and could `/wipe` the local
 * library. Admin authority now requires a real channel:
 *
 *   - `channel_post` in the destination chat is admin (the Bot API only emits
 *     that update for channels, and only channel admins can post there);
 *   - a `message` in the destination channel is admin only when Telegram
 *     confirms the sender is a chat administrator;
 *   - a group, supergroup or unrelated chat grants nothing at all;
 *   - private chats keep the explicit allowlist.
 */
export function resolveInboundRole(identity: InboundIdentity): RemoteRole | null {
  const { chatType, isChannelPost, isDestinationChat, admins } = identity;
  if (isDestinationChat && chatType === "channel") {
    if (isChannelPost) return "admin";
    if (identity.fromId != null && identity.verifiedChatAdmin) return "admin";
    return null;
  }
  if (!isChannelPost && chatType === "private") {
    return findAdmin(admins, identity.fromId)?.role ?? null;
  }
  return null;
}
