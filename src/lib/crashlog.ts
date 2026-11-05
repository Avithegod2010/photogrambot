// Global JS error handler that records crashes in the existing diagnostics
// ring buffer (maintenance -> Diagnostics). No network, no third-party SDK:
// the crash stays on the device unless the owner shares the diagnostics.
//
// The previous handler is always invoked so the default red box / logcat
// behavior is preserved during development.

import { logDiag } from "./diaglog";
import { formatCrashMessage } from "./crashFormat";

let installed = false;

export function installCrashHandler(): void {
  if (installed) return;
  installed = true;
  try {
    const g = globalThis as unknown as {
      ErrorUtils?: {
        getGlobalHandler?: () => ((error: unknown, isFatal?: boolean) => void) | undefined;
        setGlobalHandler?: (handler: (error: unknown, isFatal?: boolean) => void) => void;
      };
    };
    const errorUtils = g.ErrorUtils;
    if (!errorUtils?.setGlobalHandler) return;
    const previous = errorUtils.getGlobalHandler?.();
    errorUtils.setGlobalHandler((error, isFatal) => {
      void logDiag("crash", formatCrashMessage(error, isFatal));
      try {
        previous?.(error, isFatal);
      } catch {}
    });
  } catch {
    // A crash handler that crashes is useless — fail silently.
  }
}
