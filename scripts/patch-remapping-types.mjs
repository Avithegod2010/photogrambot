#!/usr/bin/env node
// @jridgewell/remapping publishes an invalid CJS declaration:
//   export =       function remapping(...): SourceMap;
// TypeScript parses declaration files even with skipLibCheck, so this aborts
// `tsc --noEmit`. Rewrite it to a normal declare + export assignment. The ESM
// declaration (remapping.d.mts) is already valid.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const file = join(
  process.cwd(),
  "node_modules",
  "@jridgewell",
  "remapping",
  "types",
  "remapping.d.cts"
);

if (!existsSync(file)) process.exit(0);
const src = readFileSync(file, "utf8");
if (!src.includes("export =       function")) process.exit(0);

const fixed = src.replace(
  /export =       function remapping\(([\s\S]*?)\): SourceMap;/,
  "declare function remapping($1): SourceMap;\nexport = remapping;"
);
writeFileSync(file, fixed);
console.log("patched @jridgewell/remapping/types/remapping.d.cts");
