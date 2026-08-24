import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import * as LocalAuthentication from "expo-local-authentication";
import { useTheme } from "../useTheme";
import { Button } from "../components/ui";

export function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const theme = useTheme();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [hasHardware, setHasHardware] = useState<boolean | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        setHasHardware(await LocalAuthentication.hasHardwareAsync());
      } catch {
        setHasHardware(false);
      }
    })();
    void authenticate();
  }, []);

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

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={[styles.logo, { backgroundColor: theme.colors.primaryContainer }]}>
        <Text style={{ color: theme.colors.onPrimaryContainer, fontSize: 26, fontWeight: "800" }}>
          🔒
        </Text>
      </View>
      <Text style={[styles.title, { color: theme.colors.onSurface }]}>PhotogramBot is locked</Text>
      <Text style={[styles.subtitle, { color: theme.colors.onSurfaceVariant }]}>
        {hasHardware === false
          ? "Unlock to access your photos"
          : "Authenticate to access your photos"}
      </Text>
      <Button
        title={failed ? "Try again" : "Unlock"}
        theme={theme}
        busy={busy}
        onPress={authenticate}
        style={{ marginTop: 24, minWidth: 160 }}
      />
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
});
