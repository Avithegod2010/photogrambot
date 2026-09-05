import React, { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import * as LocalAuthentication from "expo-local-authentication";
import { useTheme } from "../useTheme";
import { Button } from "../components/ui";
import { hasAnyPin, verifyPin, setDecoyActive, type PinVerifyResult } from "../lib/applock";
import { clearFailures, getBackoffRemaining, recordFailure } from "../lib/lockbackoff";

function fmtBackoff(ms: number): string {
  const s = Math.ceil(ms / 1000);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}:${String(s % 60).padStart(2, "0")}` : `0:${String(s).padStart(2, "0")}`;
}

export function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const theme = useTheme();
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
        promptMessage: "Unlock PhotogramBot",
        cancelLabel: "Retry",
        disableDeviceFallback: false,
      });
      if (res.success) {
        await clearFailures();
        onUnlock();
      } else {
        setFailed(true);
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
        await clearFailures();
        setDecoyActive(true);
        onUnlock();
      } else {
        setPinWrong(true);
        await recordFailure();
        setBackoffMs(await getBackoffRemaining());
      }
    } finally {
      verifyingRef.current = false;
    }
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={[styles.logo, { backgroundColor: theme.colors.primaryContainer }]}>
        <Text style={{ color: theme.colors.onPrimaryContainer, fontSize: 26, fontWeight: "800" }}>
          🔒
        </Text>
      </View>
      <Text style={[styles.title, { color: theme.colors.onSurface }]}>PhotogramBot is locked</Text>
      <Text style={[styles.subtitle, { color: theme.colors.onSurfaceVariant }]}>
        {backoffMs > 0
          ? `Too many attempts — try again in ${fmtBackoff(backoffMs)}`
          : pinWrong
            ? "Wrong PIN"
            : hasHardware === false
              ? "Unlock to access your photos"
              : "Authenticate to access your photos"}
      </Text>
      <Button
        title={failed ? "Try again" : "Unlock"}
        theme={theme}
        busy={busy}
        onPress={authenticate}
        style={{ marginTop: 20, minWidth: 160 }}
      />
      {pinAvailable ? (
        !showPad ? (
          <Pressable onPress={() => setShowPad(true)} hitSlop={8} style={{ marginTop: 14 }}>
            <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 13 }}>
              Use PIN instead
            </Text>
          </Pressable>
        ) : (
          <View style={{ marginTop: 20, alignItems: "center" }}>
            <Text style={{ color: theme.colors.onSurface, fontSize: 18, letterSpacing: 6, minHeight: 24 }}>
              {"•".repeat(entry.length)}
            </Text>
            <View style={styles.pad}>
              {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"].map((key, i) =>
                key === "" ? (
                  <View key={i} style={styles.padKey} />
                ) : (
                  <Pressable
                    key={i}
                    style={[styles.padKey, { backgroundColor: theme.colors.surfaceContainer, opacity: backoffMs > 0 ? 0.4 : 1 }]}
                    disabled={backoffMs > 0}
                    onPress={() => {
                      if (key === "⌫") setEntry((e) => e.slice(0, -1));
                      else pressDigit(key);
                    }}
                  >
                    <Text style={{ color: theme.colors.onSurface, fontSize: 20, fontWeight: "600" }}>
                      {key}
                    </Text>
                  </Pressable>
                )
              )}
            </View>
            <View style={{ flexDirection: "row", gap: 16, marginTop: 12 }}>
              <Pressable onPress={() => setShowPad(false)} hitSlop={8}>
                <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 13 }}>Hide</Text>
              </Pressable>
              <Pressable onPress={() => void submitPin()} hitSlop={8} disabled={entry.length < 4}>
                <Text
                  style={{
                    color: entry.length >= 4 ? theme.colors.primary : theme.colors.onSurfaceVariant,
                    fontSize: 13,
                    fontWeight: "700",
                  }}
                >
                  Enter
                </Text>
              </Pressable>
            </View>
          </View>
        )
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  logo: {
    width: 72,
    height: 72,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: "800",
  },
  subtitle: {
    fontSize: 13.5,
    marginTop: 6,
    textAlign: "center",
    lineHeight: 19,
  },
  pad: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    width: 240,
    marginTop: 12,
  },
  padKey: {
    width: 72,
    height: 56,
    borderRadius: 16,
    margin: 4,
    alignItems: "center",
    justifyContent: "center",
  },
});
