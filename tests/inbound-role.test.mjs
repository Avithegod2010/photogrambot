// Inbound authorization: a group destination must never grant admin.
//
// Regression guard for the H1 finding in reports/photogrambot.md — the
// destination chat was trusted unconditionally, so any member of a group
// configured as the destination could /wipe the owner's library.
import assert from "node:assert";
import { resolveInboundRole } from "../src/lib/remoteAuth.ts";

let passed = 0;
function check(name, fn) {
  try {
    fn();
    passed++;
    console.log(`PASS ${name}`);
  } catch (e) {
    console.error(`FAIL ${name}: ${e.message}`);
    process.exitCode = 1;
  }
}

const owner = [{ id: 42, role: "admin", name: "Anish" }];
const base = { isDestinationChat: true, admins: owner, verifiedChatAdmin: false };

check("channel_post in the destination channel is admin", () => {
  assert.strictEqual(
    resolveInboundRole({ ...base, chatType: "channel", isChannelPost: true, fromId: null }),
    "admin"
  );
});

check("plain message in the destination channel needs a verified admin", () => {
  assert.strictEqual(
    resolveInboundRole({ ...base, chatType: "channel", isChannelPost: false, fromId: 7 }),
    null
  );
  assert.strictEqual(
    resolveInboundRole({
      ...base,
      chatType: "channel",
      isChannelPost: false,
      fromId: 7,
      verifiedChatAdmin: true,
    }),
    "admin"
  );
});

check("group destination grants nothing to a random member", () => {
  assert.strictEqual(
    resolveInboundRole({ ...base, chatType: "group", isChannelPost: false, fromId: 999 }),
    null
  );
  assert.strictEqual(
    resolveInboundRole({ ...base, chatType: "supergroup", isChannelPost: false, fromId: 999 }),
    null
  );
});

check("group destination does not promote a member even if they are an allowlisted admin", () => {
  // The allowlist is a private-chat mechanism: in a group, the message is
  // visible to (and typed by) an audience that setup never vouched for.
  assert.strictEqual(
    resolveInboundRole({ ...base, chatType: "group", isChannelPost: false, fromId: 42 }),
    null
  );
});

check("callback-style channel message without a sender is not admin", () => {
  assert.strictEqual(
    resolveInboundRole({ ...base, chatType: "channel", isChannelPost: false, fromId: null }),
    null
  );
});

check("private chat keeps the allowlist and its role", () => {
  assert.strictEqual(
    resolveInboundRole({
      ...base,
      isDestinationChat: false,
      chatType: "private",
      isChannelPost: false,
      fromId: 42,
    }),
    "admin"
  );
  assert.strictEqual(
    resolveInboundRole({
      ...base,
      isDestinationChat: false,
      chatType: "private",
      isChannelPost: false,
      fromId: 43,
    }),
    null
  );
});

check("a channel that is not the destination grants nothing", () => {
  assert.strictEqual(
    resolveInboundRole({
      ...base,
      isDestinationChat: false,
      chatType: "channel",
      isChannelPost: true,
      fromId: null,
    }),
    null
  );
});

check("channel_post flag on a private chat is ignored", () => {
  assert.strictEqual(
    resolveInboundRole({
      ...base,
      isDestinationChat: false,
      chatType: "private",
      isChannelPost: true,
      fromId: 42,
    }),
    null
  );
});

console.log(`\n${passed} checks passed`);
