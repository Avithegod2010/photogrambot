// Pure crash-message formatting (unit-testable, no RN imports). The full
// stack stays in the console; the diagnostics log keeps a short signature.

export function formatCrashMessage(error: unknown, isFatal?: boolean): string {
  const e = error as { message?: unknown; stack?: unknown } | null | undefined;
  const message =
    typeof e?.message === "string" && e.message.length > 0
      ? e.message
      : String(error ?? "Unknown error");
  const stack =
    typeof e?.stack === "string"
      ? e.stack
          .split("\n")
          // Keep the message line + up to three stack frames.
          .slice(0, 4)
          .map((line) => line.trim())
          .filter(Boolean)
          .join(" | ")
      : "";
  return `${isFatal ? "FATAL " : ""}${message}${stack ? ` | ${stack}` : ""}`.slice(0, 300);
}
