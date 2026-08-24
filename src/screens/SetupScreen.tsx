import React, { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSetupStore } from "../store/useSetupStore";
import { useTheme } from "../useTheme";
import { Button, Card, SectionLabel, TextField } from "../components/ui";

export function SetupScreen() {
  const theme = useTheme();
  const { verifyAndSave, saveChannel, detectChannel, busy, error, token, channelId } =
    useSetupStore();

  const [tokenInput, setTokenInput] = useState("");
  const [channelInput, setChannelInput] = useState("");
  const [step, setStep] = useState<"token" | "channel">(token && !channelId ? "channel" : "token");
  const [localError, setLocalError] = useState<string | null>(null);
  const [detectedTitle, setDetectedTitle] = useState<string | null>(null);

  const shownError = localError ?? error;

  async function onVerifyToken() {
    setLocalError(null);
    const t = tokenInput.trim();
    if (!/^\d+:[A-Za-z0-9_-]{30,}$/.test(t)) {
      setLocalError("That does not look like a bot token. Get one from @BotFather.");
      return;
    }
    const ok = await verifyAndSave(t);
    if (ok) setStep("channel");
  }

  async function onDetect() {
    setLocalError(null);
    const found = await detectChannel();
    if (!found) {
      setLocalError(
        "Nothing found yet. Add the bot as an admin to your channel, then post any photo or text in the channel and tap Detect again."
      );
      return;
    }
    setDetectedTitle(found.title ?? found.id);
    const ok = await saveChannel(found.id);
    if (!ok) setLocalError("Found a chat but could not verify it. Try pasting the ID manually.");
  }

  async function onManualChannel() {
    setLocalError(null);
    const id = channelInput.trim();
    if (!/^-100\d{6,}$/.test(id)) {
      setLocalError("Channel/group IDs look like -1001234567890.");
      return;
    }
    await saveChannel(id);
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.hero}>
          <View style={[styles.logo, { backgroundColor: theme.colors.primaryContainer }]}>
            <Text style={[styles.logoText, { color: theme.colors.onPrimaryContainer }]}>PB</Text>
          </View>
          <Text style={[styles.title, { color: theme.colors.onSurface }]}>PhotogramBot</Text>
          <Text style={[styles.subtitle, { color: theme.colors.onSurfaceVariant }]}>
            Your personal photo gallery, backed by your own Telegram bot and channel.
            Unlimited storage, no middleman.
          </Text>
        </View>

        {step === "token" ? (
          <Card theme={theme}>
            <SectionLabel text="Step 1 · Bot token" theme={theme} />
            <Text style={[styles.help, { color: theme.colors.onSurfaceVariant }]}>
              Open Telegram, message {"@BotFather"}, send /newbot and paste the token here.
            </Text>
            <TextField
              value={tokenInput}
              onChangeText={setTokenInput}
              placeholder="123456789:AAHb..."
              theme={theme}
              autoCapitalize="none"
            />
            {shownError ? (
              <Text style={[styles.error, { color: theme.colors.error }]}>{shownError}</Text>
            ) : null}
            <Button
              title="Verify token"
              onPress={onVerifyToken}
              theme={theme}
              busy={busy}
              style={styles.cta}
            />
          </Card>
        ) : (
          <Card theme={theme}>
            <SectionLabel text="Step 2 · Backup channel" theme={theme} />
            <Text style={[styles.help, { color: theme.colors.onSurfaceVariant }]}>
              1. Create a private channel in Telegram.{"\n"}
              2. Add your bot as an admin with all permissions.{"\n"}
              3. Post anything in the channel, then tap Detect — or paste the channel ID.
            </Text>
            {detectedTitle ? (
              <Text style={[styles.detected, { color: theme.colors.success }]}>
                Detected: {detectedTitle}
              </Text>
            ) : null}
            <Button
              title="Detect channel"
              onPress={onDetect}
              theme={theme}
              variant="outlined"
              busy={busy}
              style={styles.cta}
            />
            <Text style={[styles.or, { color: theme.colors.onSurfaceVariant }]}>or</Text>
            <TextField
              value={channelInput}
              onChangeText={setChannelInput}
              placeholder="-1001234567890"
              theme={theme}
              keyboardType="numeric"
            />
            {shownError ? (
              <Text style={[styles.error, { color: theme.colors.error }]}>{shownError}</Text>
            ) : null}
            <Button
              title="Use this channel"
              onPress={onManualChannel}
              theme={theme}
              busy={busy}
              style={styles.cta}
            />
          </Card>
        )}

        <Text style={[styles.footer, { color: theme.colors.onSurfaceVariant }]}>
          Your token is stored encrypted on this device. Photos go directly from your phone to
          your own channel — PhotogramBot has no servers.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scroll: {
    padding: 20,
    paddingTop: 64,
    paddingBottom: 48,
  },
  hero: {
    alignItems: "center",
    marginBottom: 28,
  },
  logo: {
    width: 72,
    height: 72,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  logoText: {
    fontSize: 26,
    fontWeight: "800",
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
    marginTop: 8,
    paddingHorizontal: 8,
  },
  help: {
    fontSize: 13.5,
    lineHeight: 20,
    marginBottom: 12,
  },
  cta: {
    marginTop: 16,
  },
  or: {
    textAlign: "center",
    marginVertical: 10,
    fontSize: 13,
  },
  error: {
    fontSize: 13,
    marginTop: 10,
    lineHeight: 18,
  },
  detected: {
    fontSize: 13,
    marginBottom: 10,
    fontWeight: "600",
  },
  footer: {
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
    marginTop: 24,
    paddingHorizontal: 12,
  },
});
