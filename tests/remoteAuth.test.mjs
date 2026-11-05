// Remote-control role and allowlist parsing.
import assert from "node:assert";
import {
  findAdmin,
  parseRemoteAdmins,
  requiredRoleForCommand,
  roleAtLeast,
} from "../src/lib/remoteAuth.ts";

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

check("role ranking is strict", () => {
  assert.equal(roleAtLeast("admin", "read"), true);
  assert.equal(roleAtLeast("admin", "write"), true);
  assert.equal(roleAtLeast("write", "admin"), false);
  assert.equal(roleAtLeast("read", "write"), false);
  assert.equal(roleAtLeast("write", "write"), true);
});

check("command roles cover the destructive boundary", () => {
  assert.equal(requiredRoleForCommand("/status"), "read");
  assert.equal(requiredRoleForCommand("/sync"), "write");
  assert.equal(requiredRoleForCommand("/delete"), "admin");
  assert.equal(requiredRoleForCommand("/wipe"), "admin");
  assert.equal(requiredRoleForCommand("/nope"), null);
  assert.equal(requiredRoleForCommand("/STATUS"), "read");
});

check("admin parsing drops malformed and duplicate ids", () => {
  const parsed = parseRemoteAdmins([
    { id: 42, role: "write", name: "Anish" },
    { id: 42, role: "admin" },
    { id: -1, role: "read" },
    { id: "7", role: "admin" },
    { id: "8", role: "bogus" },
    "nope",
    null,
  ]);
  assert.deepEqual(parsed, [
    { id: 42, role: "write", name: "Anish" },
    { id: 7, role: "admin", name: undefined },
    { id: 8, role: "read", name: undefined },
  ]);
});

check("findAdmin matches only known ids", () => {
  const admins = parseRemoteAdmins([{ id: 5, role: "read" }]);
  assert.equal(findAdmin(admins, 5)?.role, "read");
  assert.equal(findAdmin(admins, 6), null);
  assert.equal(findAdmin(admins, null), null);
});

check("non-array values are empty", () => {
  assert.deepEqual(parseRemoteAdmins(null), []);
  assert.deepEqual(parseRemoteAdmins({ id: 1 }), []);
});

console.log(`\n${passed} checks passed`);
if (process.exitCode) process.exit(process.exitCode);
