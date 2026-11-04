// Metro resolves extensionless relative imports (`import "./format"`); plain
// Node ESM does not. This synchronous resolve hook appends `.ts` so the test
// suite can import the exact modules that ship in the app instead of keeping
// copied logic in sync by hand.
import { registerHooks } from "node:module";

registerHooks({
  resolve(specifier, context, nextResolve) {
    const relative = specifier.startsWith("./") || specifier.startsWith("../");
    const hasExtension = /\.[a-z0-9]+$/i.test(specifier);
    if (relative && !hasExtension) {
      try {
        return nextResolve(`${specifier}.ts`, context);
      } catch {
        // Fall through to the normal resolver so a genuine typo still reports
        // Node's own "Cannot find module" error with the original specifier.
      }
    }
    return nextResolve(specifier, context);
  },
});
