import React, { useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "../rn";
import { useSetupStore } from "../store/useSetupStore";
import { useTheme } from "../useTheme";
import { useSettingsStore } from "../store/useSettingsStore";
import { Button, Card, IconButton, SectionLabel, TextField } from "../components/ui";
import { CheckIcon } from "../components/icons";
import { restoreFromChannelPinned } from "../lib/backup";
import { setBackupPassphrase } from "../lib/settings";
import { countAllPhotoVersions, getAlbums, getSavedSearches } from "../lib/db";
import { runSyncNow } from "../lib/sync";
import { radius, spacing, touchTarget, typography, type AppTheme } from "../theme";

type SetupStep = "token" | "channel" | "restore" | "done";

const STEP_LABELS: { key: SetupStep; label: string; short: string }[] = [
  { key: "token", label: "Bot token", short: "Token" },
  { key: "channel", label: "Backup channel", short: "Channel" },
  { key: "restore", label: "Restore library", short: "Restore" },
];

function stepIndex(step: SetupStep): number {
  if (step === "done") return 3;
  return Math.max(0, STEP_LABELS.findIndex((s) => s.key === step));
}

/** 3-dot progress rail: complete / current / upcoming, always labelled. */
function StepIndicator({ step, theme }: { step: SetupStep; theme: AppTheme }) {
  const active = stepIndex(step);
  return (
    <View
      style={styles.stepper}
      accessibilityRole="progressbar"
      accessibilityLabel="Setup progress"
      accessibilityValue={{ min: 0, max: 3, now: Math.min(3, active + 1) }}
    >
      {STEP_LABELS.map((s, i) => {
        const done = i < active || step === "done";
        const current = i === active && step !== "done";
        return (
          <React.Fragment key={s.key}>
            {i > 0 ? (
              <View
                style={[
                  styles.stepLine,
                  { backgroundColor: i <= active ? theme.colors.primary : theme.colors.outlineVariant },
                ]}
              />
            ) : null}
            <View style={styles.stepItem}>
              <View
                style={[
                  styles.stepDot,
                  {
                    backgroundColor: done
                      ? theme.colors.primary
                      : current
                        ? theme.colors.primaryContainer
                        : theme.colors.surfaceContainer,
                    borderColor: current || done ? theme.colors.primary : theme.colors.outline,
                  },
                ]}
              >
                {done ? (
                  <CheckIcon color={theme.colors.onPrimary} size={14} />
                ) : (
                  <Text
                    style={[
                      typography.caption,
                      {
                        color: current
                          ? theme.colors.onPrimaryContainer
                          : theme.colors.onSurfaceVariant,
                        fontWeight: "700",
                      },
                    ]}
                  >
                    {i + 1}
                  </Text>
                )}
              </View>
              <Text
                numberOfLines={1}
                style={[
                  typography.caption,
                  {
                    color: current ? theme.colors.onSurface : theme.colors.onSurfaceVariant,
                    fontWeight: current ? "700" : "500",
                    marginTop: 4,
                  },
                ]}
              >
                {s.short}
              </Text>
            </View>
          </React.Fragment>
        );
      })}
    </View>
  );
}

export function SetupScreen() {
  const theme = useTheme();
  const appDisplayName = useSettingsStore((s) => s.prefs.appDisplayName);
  const { verifyAndSave, saveChannel, detectChannel, busy, error, token, channelId } =
    useSetupStore();
  const migrationOffer = useSetupStore((s) => s.migrationOffer);
  const finishMigration = useSetupStore((s) => s.finishMigration);

  const [tokenInput, setTokenInput] = useState("");
  const [channelInput, setChannelInput] = useState("");
  const [step, setStep] = useState<SetupStep>(token && !channelId ? "channel" : "token");
  const [localError, setLocalError] = useState<string | null>(null);
  const [detectedTitle, setDetectedTitle] = useState<string | null>(null);
  const [passInput, setPassInput] = useState("");
  const [restoring, setRestoring] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [summary, setSummary] = useState<{
    photos: number;
    versions: number;
    albums: number;
    searches: number;
  } | null>(null);

  const shownError = localError ?? error;

  async function afterChannelSaved(ok: boolean, message: string) {
    if (!ok) {
      setLocalError(message);
      return;
    }
    // A pinned channel backup on an empty library = a new phone — offer to
    // restore instead of dropping the user into an empty gallery.
    if (useSetupStore.getState().migrationOffer) setStep("restore");
  }

  async function onRestore() {
    setLocalError(null);
    if (!passInput) {
      setLocalError("Enter the backup passphrase you set on the old phone.");
      return;
    }
    setRestoring(true);
    try {
      await setBackupPassphrase(passInput);
      const result = await restoreFromChannelPinned(true);
      const [versions, albums, searches] = await Promise.all([
        countAllPhotoVersions(),
        getAlbums(),
        getSavedSearches(),
      ]);
      setSummary({
        photos: result.restored,
        versions,
        albums: albums.length,
        searches: searches.length,
      });
      setStep("done");
      // Relink pass: scan this device; every asset whose content hash matches
      // a restored row adopts it, the rest stay cloud-only.
      void runSyncNow();
    } catch (e: any) {
      setLocalError(e?.message ?? "Restore failed.");
    } finally {
      setRestoring(false);
    }
  }

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
    await afterChannelSaved(ok, "Found a chat but could not verify it. Try pasting the ID manually.");
  }

  async function onManualChannel() {
    setLocalError(null);
    const id = channelInput.trim();
    if (!/^-100\d{6,}$/.test(id)) {
      setLocalError("Channel/group IDs look like -1001234567890.");
      return;
    }
    const ok = await saveChannel(id);
    await afterChannelSaved(ok, "Could not reach this chat. Make sure the bot is an admin there.");
  }

  const heading = useMemo(() => {
    switch (step) {
      case "channel":
        return "Connect your channel";
      case "restore":
        return "Restore your library";
      case "done":
        return "You're all set";
      default:
        return "Connect your bot";
    }
  }, [step]);

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <View style={[styles.logo, { backgroundColor: theme.colors.primaryContainer }]}>
            <Text style={[typography.headline, { color: theme.colors.onPrimaryContainer }]}>PB</Text>
          </View>
          <Text
            accessibilityRole="header"
            style={[typography.display, { color: theme.colors.onSurface, textAlign: "center" }]}
          >
            {appDisplayName || "PhotogramBot"}
          </Text>
          <Text
            style={[
              typography.body,
              {
                color: theme.colors.onSurfaceVariant,
                textAlign: "center",
                marginTop: spacing.sm,
                maxWidth: 340,
              },
            ]}
          >
            Your photo gallery, backed by your own Telegram bot and channel. Unlimited storage,
            no middleman.
          </Text>
        </View>

        <StepIndicator step={step} theme={theme} />

        <Text
          accessibilityRole="header"
          style={[
            typography.title,
            { color: theme.colors.onSurface, marginTop: spacing.xl, marginBottom: spacing.md },
          ]}
        >
          {heading}
        </Text>

        {step === "token" ? (
          <Card theme={theme}>
            <SectionLabel text="Step 1 of 3" theme={theme} action={undefined} />
            <Text style={[typography.small, { color: theme.colors.onSurfaceVariant }]}>
              Open Telegram, message @BotFather, send /newbot and paste the token here. It is stored
              encrypted on this device.
            </Text>
            <TextField
              value={tokenInput}
              onChangeText={(v) => {
                setTokenInput(v);
                if (localError) setLocalError(null);
              }}
              placeholder="123456789:AAHb…"
              label="Bot token"
              theme={theme}
              secureTextEntry={!showToken}
              autoCapitalize="none"
              error={shownError}
              style={{ marginTop: spacing.md }}
              trailing={
                <Pressable
                  onPress={() => setShowToken((v) => !v)}
                  accessibilityRole="button"
                  accessibilityLabel={showToken ? "Hide bot token" : "Show bot token"}
                  accessibilityState={{ expanded: showToken }}
                  style={styles.showToggle}
                >
                  <Text style={[typography.label, { color: theme.colors.primary }]}>
                    {showToken ? "Hide" : "Show"}
                  </Text>
                </Pressable>
              }
            />
            <Button
              title="Verify and continue"
              onPress={onVerifyToken}
              theme={theme}
              busy={busy}
              style={{ marginTop: spacing.lg }}
            />
          </Card>
        ) : null}

        {step === "channel" ? (
          <Card theme={theme}>
            <SectionLabel text="Step 2 of 3" theme={theme} />
            <View style={{ gap: spacing.xs, marginBottom: spacing.md }}>
              {[
                "Create a private channel in Telegram.",
                "Add your bot as an admin with all permissions.",
                "Post anything in the channel, then tap Detect.",
              ].map((line, i) => (
                <View key={line} style={styles.bulletRow}>
                  <View style={[styles.bullet, { backgroundColor: theme.colors.primary }]}>
                    <Text style={[typography.badge, { color: theme.colors.onPrimary }]}>{i + 1}</Text>
                  </View>
                  <Text style={[typography.small, { color: theme.colors.onSurfaceVariant, flex: 1 }]}>
                    {line}
                  </Text>
                </View>
              ))}
            </View>

            {detectedTitle ? (
              <View
                style={[styles.successRow, { backgroundColor: theme.colors.surfaceContainer }]}
                accessibilityLiveRegion="polite"
              >
                <View style={[styles.successDot, { backgroundColor: theme.colors.success }]} />
                <Text style={[typography.small, { color: theme.colors.onSurface, flex: 1 }]}>
                  Detected {detectedTitle}
                </Text>
              </View>
            ) : null}

            <Button
              title="Detect channel"
              onPress={onDetect}
              theme={theme}
              variant="tonal"
              busy={busy}
            />
            <View style={styles.orRow}>
              <View style={[styles.orLine, { backgroundColor: theme.colors.outlineVariant }]} />
              <Text style={[typography.caption, { color: theme.colors.onSurfaceVariant }]}>
                or
              </Text>
              <View style={[styles.orLine, { backgroundColor: theme.colors.outlineVariant }]} />
            </View>
            <TextField
              value={channelInput}
              onChangeText={(v) => {
                setChannelInput(v);
                if (localError) setLocalError(null);
              }}
              placeholder="-1001234567890"
              label="Channel ID"
              theme={theme}
              keyboardType="numeric"
              error={shownError}
            />
            <Button
              title="Use this channel"
              onPress={onManualChannel}
              theme={theme}
              busy={busy}
              style={{ marginTop: spacing.lg }}
            />
          </Card>
        ) : null}

        {step === "restore" && migrationOffer ? (
          <Card theme={theme}>
            <SectionLabel text="Step 3 of 3" theme={theme} />
            <Text style={[typography.small, { color: theme.colors.onSurfaceVariant }]}>
              This channel already holds a PhotogramBot backup
              {migrationOffer.exportedAt ? ` from ${migrationOffer.exportedAt.slice(0, 10)}` : ""}
              {migrationOffer.encrypted ? " (encrypted)" : ""}. Restore your whole library —
              photos, albums, favorites and version history — to this phone.
            </Text>
            <TextField
              value={passInput}
              onChangeText={(v) => {
                setPassInput(v);
                if (localError) setLocalError(null);
              }}
              placeholder="Backup passphrase"
              label="Backup passphrase"
              theme={theme}
              secureTextEntry
              error={shownError}
              style={{ marginTop: spacing.md }}
            />
            <Button
              title="Restore library"
              onPress={onRestore}
              theme={theme}
              busy={restoring}
              style={{ marginTop: spacing.lg }}
            />
            <Button
              title="Skip — set up as new"
              onPress={finishMigration}
              theme={theme}
              variant="text"
              style={{ marginTop: spacing.sm }}
            />
          </Card>
        ) : null}

        {step === "done" && migrationOffer ? (
          <Card theme={theme}>
            <SectionLabel text="Restore complete" theme={theme} />
            <Text style={[typography.small, { color: theme.colors.onSurfaceVariant }]}>
              Restored {summary?.photos ?? 0} photos, {summary?.versions ?? 0} version history
              entries, {summary?.albums ?? 0} albums and {summary?.searches ?? 0} saved searches
              from your channel backup.
            </Text>
            <Text
              style={[
                typography.small,
                { color: theme.colors.onSurfaceVariant, marginTop: spacing.sm },
              ]}
            >
              PhotogramBot is scanning this device now — photos found on this phone are relinked
              automatically. Anything not on this phone stays safely in your cloud.
            </Text>
            <Button
              title="Open PhotogramBot"
              onPress={finishMigration}
              theme={theme}
              style={{ marginTop: spacing.lg }}
            />
          </Card>
        ) : null}

        <View style={styles.footerRow}>
          <IconButton
            icon={<CheckIcon color={theme.colors.onSurfaceVariant} size={16} />}
            label="Privacy note"
            theme={theme}
            style={styles.footerIcon}
          />
          <Text style={[typography.caption, { color: theme.colors.onSurfaceVariant, flex: 1 }]}>
            Photos go directly from your phone to your own channel. PhotogramBot has no servers.
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scroll: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xxl + 24,
    paddingBottom: spacing.xxl + spacing.lg,
    maxWidth: 560,
    width: "100%",
    alignSelf: "center",
  },
  hero: {
    alignItems: "center",
    marginBottom: spacing.xl,
  },
  logo: {
    width: 72,
    height: 72,
    borderRadius: radius.sheet,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.lg,
  },
  stepper: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
  },
  stepItem: {
    alignItems: "center",
    width: 72,
  },
  stepDot: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  stepLine: {
    flex: 1,
    height: 2,
    borderRadius: radius.pill,
    marginTop: 13,
    marginHorizontal: spacing.xs,
  },
  bulletRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  bullet: {
    width: 20,
    height: 20,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  successRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderRadius: radius.control,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
  },
  successDot: {
    width: 8,
    height: 8,
    borderRadius: radius.pill,
  },
  orRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginVertical: spacing.md,
  },
  orLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  showToggle: {
    minHeight: touchTarget,
    minWidth: touchTarget,
    paddingHorizontal: spacing.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.xl,
    paddingHorizontal: spacing.xs,
  },
  footerIcon: {
    width: 32,
    height: 32,
  },
});
