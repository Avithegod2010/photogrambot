import React, { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "../rn";
import * as LocalAuthentication from "expo-local-authentication";
import { useTheme } from "../useTheme";
import { useSettingsStore } from "../store/useSettingsStore";
import { Button, Dialog } from "../components/ui";
import { LockIcon } from "../components/icons";
import { hasAnyPin, verifyPin, setDecoyActive, type PinVerifyResult } from "../lib/applock";
import { clearFailures, getBackoffRemaining, recordFailure } from "../lib/lockbackoff";
import { logBreakIn } from "../lib/breakin";
import { setSecureFlag } from "../../modules/share-intent";
import { overlay, radius, spacing, typography } from "../theme";

function fmtBackoff(ms: number): string {
  const s = Math.ceil(ms / 1000);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}:${String(s % 60).padStart(2, "0")}` : `0:${String(s).padStart(2, "0")}`;
}

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"] as const;

export function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const theme = useTheme();
  const appDisplayName = useSettingsStore((s) => s.prefs.appDisplayName);
  const secureViewer = useSettingsStore((s) => s.prefs.secureViewer);
  const panicWipeEnabled = useSettingsStore((s) => s.prefs.panicWipeEnabled);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [pinWrong, setPinWrong] = useState(false);
  const [hasHardware, setHasHardware] = useState<boolean | null>(null);
  const [pinAvailable, setPinAvailable] = useState(false);
  const [entry, setEntry] = useState("");
  const [showPad, setShowPad] = useState(false);
  // Failed-unlock backoff: while backoffMs > 0 the PIN pad is dead (the pad
  // is what an attacker can brute) but biometric stays live — a biometric
  // success proves ownership and clears the counter.
  const [backoffMs, setBackoffMs] = useState(0);
  const [panicVisible, setPanicVisible] = useState(false);
  const [notice, setNotice] = useState<{ title: string; message: string } | null>(null);

  // Hide the lock screen (and its PIN entry) from screenshots/recents.
  useEffect(() => {
    setSecureFlag(secureViewer);
    return () => {
      setSecureFlag(false);
    };
  }, [secureViewer]);
  const backoffTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        setHasHardware(await LocalAuthentication.hasHardwareAsync());
        setPinAvailable(await hasAnyPin());
      } catch {
        setHasHardware(false);
      }
      setBackoffMs(await getBackoffRemaining());
    })();
    void authenticate();
    return () => {
      if (backoffTimer.current) clearInterval(backoffTimer.current);
    };
  }, []);

  // 1 s countdown while backoff is active; cleared as soon as it hits zero.
  useEffect(() => {
    if (backoffMs <= 0) {
      if (backoffTimer.current) {
        clearInterval(backoffTimer.current);
        backoffTimer.current = null;
      }
      return;
    }
    if (backoffTimer.current) return;
    backoffTimer.current = setInterval(() => {
      void getBackoffRemaining().then((ms) => setBackoffMs(ms));
    }, 1000);
    return () => {
      if (backoffTimer.current) {
        clearInterval(backoffTimer.current);
        backoffTimer.current = null;
      }
    };
  }, [backoffMs > 0]);

  async function authenticate() {
    setBusy(true);
    setFailed(false);
    try {
      const res = await LocalAuthentication.authenticateAsync({
        promptMessage: `Unlock ${appDisplayName || "PhotogramBot"}`,
        cancelLabel: "Retry",
        disableDeviceFallback: false,
      });
      if (res.success) {
        await clearFailures();
        onUnlock();
      } else {
        setFailed(true);
        // Only genuine rejections count as break-in evidence — user cancels
        // (cancelLabel "Retry") and system cancels don't.
        if (res.error === "authentication_failed" || res.error === "lockout") {
          void logBreakIn("biometric_fail");
        }
      }
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  function pressDigit(d: string) {
    setPinWrong(false);
    const next = (entry + d).slice(0, 8);
    setEntry(next);
  }

  const verifyingRef = useRef(false);
  async function submitPin() {
    if (verifyingRef.current) return;
    if (entry.length < 4) return;
    if (backoffMs > 0) return;
    verifyingRef.current = true;
    try {
      const result: PinVerifyResult = await verifyPin(entry);
      setEntry("");
      if (result === "real") {
        await clearFailures();
        onUnlock();
      } else if (result === "decoy") {
        // A decoy hit proves knowledge too — clear, and keep the decoy session
        // indistinguishable from a real unlock (both pass the same backoff).
        void logBreakIn("decoy_unlock");
        await clearFailures();
        setDecoyActive(true);
        onUnlock();
      } else {
        setPinWrong(true);
        void logBreakIn("pin_fail");
        await recordFailure();
        setBackoffMs(await getBackoffRemaining());
      }
    } finally {
      verifyingRef.current = false;
    }
  }

  const statusText =
    backoffMs > 0
      ? `Too many attempts — try again in ${fmtBackoff(backoffMs)}`
      : pinWrong
        ? "Wrong PIN. Try again."
        : hasHardware === false
          ? "Enter your PIN to open your photos"
          : "Authenticate to open your photos";

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={styles.hero}>
        <View style={[styles.logo, { backgroundColor: theme.colors.primaryContainer }]}>
          <LockIcon color={theme.colors.onPrimaryContainer} size={30} />
        </View>
        <Pressable
          delayLongPress={2500}
          onLongPress={() => {
            if (panicWipeEnabled) setPanicVisible(true);
          }}
          accessibilityRole="header"
          accessibilityLabel={`${appDisplayName || "PhotogramBot"} is locked`}
          accessibilityHint={panicWipeEnabled ? "Long-press to panic-wipe local data" : undefined}
          style={styles.titleHit}
        >
          <Text style={[typography.title, { color: theme.colors.onSurface, textAlign: "center" }]}>
            {appDisplayName || "PhotogramBot"} is locked
          </Text>
        </Pressable>
        <Text
          accessibilityLiveRegion="polite"
          style={[
            typography.small,
            {
              color: pinWrong || backoffMs > 0 ? theme.colors.error : theme.colors.onSurfaceVariant,
              textAlign: "center",
              minHeight: 40,
              marginTop: spacing.xs,
            },
          ]}
        >
          {statusText}
        </Text>
      </View>

      <View style={styles.actions}>
        {hasHardware !== false ? (
          <Button
            title={failed ? "Try again" : "Unlock"}
            theme={theme}
            busy={busy}
            onPress={authenticate}
            style={styles.primaryBtn}
          />
        ) : null}

        {pinAvailable ? (
          !showPad ? (
            <Button
              title="Use PIN instead"
              theme={theme}
              variant="text"
              onPress={() => setShowPad(true)}
              style={{ marginTop: spacing.sm }}
            />
          ) : (
            <View style={styles.padWrap}>
              <View
                style={styles.dots}
                accessibilityRole="text"
                accessibilityLabel={`${entry.length} of at least 4 digits entered`}
              >
                {Array.from({ length: Math.max(4, entry.length) }).map((_, i) => (
                  <View
                    key={i}
                    style={[
                      styles.dot,
                      {
                        backgroundColor:
                          i < entry.length ? theme.colors.primary : theme.colors.outlineVariant,
                      },
                    ]}
                  />
                ))}
              </View>
              <View style={styles.pad}>
                {KEYS.map((key, i) =>
                  key === "" ? (
                    <View key={i} style={styles.padKey} />
                  ) : (
                    <Pressable
                      key={i}
                      android_ripple={{ color: overlay.ripple, borderless: true }}
                      accessibilityRole="button"
                      accessibilityLabel={key === "⌫" ? "Delete last digit" : `Digit ${key}`}
                      accessibilityState={{ disabled: backoffMs > 0 }}
                      disabled={backoffMs > 0}
                      onPress={() => {
                        if (key === "⌫") setEntry((e) => e.slice(0, -1));
                        else pressDigit(key);
                      }}
                      style={[
                        styles.padKey,
                        {
                          backgroundColor: theme.colors.surfaceContainer,
                          opacity: backoffMs > 0 ? 0.4 : 1,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          key === "⌫" ? typography.section : typography.headline,
                          { color: theme.colors.onSurface },
                        ]}
                      >
                        {key}
                      </Text>
                    </Pressable>
                  )
                )}
              </View>
              <View style={styles.padActions}>
                <Button
                  title="Hide"
                  theme={theme}
                  variant="text"
                  onPress={() => setShowPad(false)}
                />
                <Button
                  title="Enter"
                  theme={theme}
                  variant="filled"
                  disabled={entry.length < 4 || backoffMs > 0}
                  onPress={() => void submitPin()}
                  style={styles.enterBtn}
                />
              </View>
            </View>
          )
        ) : null}
      </View>

      <Dialog
        visible={panicVisible}
        theme={theme}
        title="Panic wipe?"
        message="Erase the local index, cached photos and every saved credential on this phone. The Telegram channel archive is not touched and can be restored later."
        onClose={() => setPanicVisible(false)}
        actions={[
          { label: "Cancel", onPress: () => setPanicVisible(false), variant: "text" },
          {
            label: "Wipe this phone",
            variant: "danger",
            onPress: () => {
              setPanicVisible(false);
              void (async () => {
                try {
                  const { panicWipe } = await import("../lib/panicWipe");
                  await panicWipe();
                  setNotice({
                    title: "Wiped",
                    message:
                      "Local data and credentials are gone. Close the app; the channel archive is still intact.",
                  });
                } catch (e: any) {
                  setNotice({
                    title: "Wipe failed",
                    message: e?.message ?? "Could not wipe local data.",
                  });
                }
              })();
            },
          },
        ]}
      />
      <Dialog
        visible={!!notice}
        theme={theme}
        title={notice?.title ?? ""}
        message={notice?.message}
        onClose={() => setNotice(null)}
        actions={[{ label: "Close", onPress: () => setNotice(null) }]}
      />
    </View>
  );
}

const KEY_SIZE = 68;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxl,
  },
  hero: {
    alignItems: "center",
  },
  logo: {
    width: 76,
    height: 76,
    borderRadius: radius.sheet,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.lg,
  },
  titleHit: {
    minHeight: 32,
    justifyContent: "center",
  },
  actions: {
    marginTop: spacing.xl,
    alignItems: "center",
    width: "100%",
  },
  primaryBtn: {
    minWidth: 200,
  },
  padWrap: {
    alignItems: "center",
    marginTop: spacing.lg,
  },
  dots: {
    flexDirection: "row",
    gap: spacing.md,
    height: 24,
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: radius.pill,
  },
  pad: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    width: (KEY_SIZE + spacing.sm) * 3,
  },
  padKey: {
    width: KEY_SIZE,
    height: KEY_SIZE,
    borderRadius: radius.pill,
    margin: spacing.xs,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  padActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  enterBtn: {
    minWidth: 120,
  },
});
