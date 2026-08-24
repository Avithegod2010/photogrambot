import React, { useCallback, useState } from "react";
import {
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../useTheme";
import { useSetupStore } from "../store/useSetupStore";
import { Button, Card, SectionLabel, TextField } from "../components/ui";
import {
  listProfiles,
  saveProfile,
  deleteProfile,
  listRules,
  setRule,
  newProfileId,
  DEFAULT_PROFILE_ID,
  type DestProfile,
} from "../lib/destinations";
import { getChat } from "../lib/telegram";

export function DestinationsScreen({ navigation }: { navigation: any }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { channelTitle } = useSetupStore();

  const [profiles, setProfiles] = useState<DestProfile[]>([]);
  const [rules, setRules] = useState<Record<string, string>>({});
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [token, setToken] = useState("");
  const [channelId, setChannelId] = useState("");
  const [saving, setSaving] = useState(false);
  const [ruleFolder, setRuleFolder] = useState("");
  const [ruleProfileId, setRuleProfileId] = useState<string | null>(null);

  const reload = useCallback(() => {
    void listProfiles().then(setProfiles);
    void listRules().then(setRules);
  }, []);

  useFocusEffect(reload);

  async function onAdd() {
    if (!name.trim() || !token.trim() || !channelId.trim()) return;
    setSaving(true);
    try {
      const chat = await getChat(channelId.trim(), token.trim());
      if (!chat) throw new Error("Could not reach that channel with this bot");
      await saveProfile(
        {
          id: newProfileId(),
          name: name.trim(),
          channelId: channelId.trim(),
          channelTitle: chat.title,
        },
        token.trim()
      );
      setName("");
      setToken("");
      setChannelId("");
      setAdding(false);
      reload();
    } catch (e: any) {
      Alert.alert(
        "Could not add destination",
        e?.message ?? "Check the bot token and channel ID. The bot must be a member of the channel."
      );
    } finally {
      setSaving(false);
    }
  }

  function confirmDelete(p: DestProfile) {
    Alert.alert(
      `Remove ${p.name}?`,
      "Photos already uploaded there stay in Telegram. Folder rules pointing here are removed.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            await deleteProfile(p.id);
            reload();
          },
        },
      ]
    );
  }

  const profileName = (id: string | undefined) =>
    id === DEFAULT_PROFILE_ID
      ? `Default${channelTitle ? ` (${channelTitle})` : ""}`
      : profiles.find((p) => p.id === id)?.name ?? "?";

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={{ color: theme.colors.onSurface, fontSize: 20 }}>←</Text>
        </Pressable>
        <Text style={[styles.title, { color: theme.colors.onSurface }]}>Destinations</Text>
      </View>

      <FlatList
        data={profiles}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 60 }}
        ListHeaderComponent={
          <View>
            <SectionLabel text="Default" theme={theme} />
            <Card theme={theme}>
              <Text style={{ color: theme.colors.onSurface, fontWeight: "700" }}>
                Default {channelTitle ? `· ${channelTitle}` : ""}
              </Text>
              <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 12.5, marginTop: 2 }}>
                The bot and channel from Setup. Used when no other destination applies.
              </Text>
            </Card>

            <SectionLabel text="Other destinations" theme={theme} />
            {!adding ? (
              <Button
                title="Add destination"
                variant="outlined"
                theme={theme}
                onPress={() => setAdding(true)}
              />
            ) : (
              <Card theme={theme}>
                <TextField value={name} onChangeText={setName} placeholder="Name (e.g. Family)" theme={theme} />
                <View style={{ height: 8 }} />
                <TextField
                  value={token}
                  onChangeText={setToken}
                  placeholder="Bot token (of the other bot)"
                  secureTextEntry
                  theme={theme}
                />
                <View style={{ height: 8 }} />
                <TextField
                  value={channelId}
                  onChangeText={setChannelId}
                  placeholder="Channel ID (e.g. -100…)"
                  keyboardType="numeric"
                  theme={theme}
                />
                <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 11.5, marginTop: 6 }}>
                  That bot must be added to its channel as an administrator.
                </Text>
                <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 10 }}>
                  <Button
                    title="Cancel"
                    variant="text"
                    theme={theme}
                    onPress={() => {
                      setAdding(false);
                      setName("");
                      setToken("");
                      setChannelId("");
                    }}
                  />
                  <Button
                    title="Save"
                    theme={theme}
                    busy={saving}
                    disabled={!name.trim() || !token.trim() || !channelId.trim()}
                    onPress={() => void onAdd()}
                  />
                </View>
              </Card>
            )}

            <SectionLabel text="Folder routing" theme={theme} />
            <Card theme={theme}>
              {Object.keys(rules).length === 0 ? (
                <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 12.5 }}>
                  No rules — everything uploads to Default unless you pick another destination manually.
                </Text>
              ) : (
                Object.entries(rules).map(([folder, pid]) => (
                  <View key={folder} style={styles.ruleRow}>
                    <Text style={{ color: theme.colors.onSurface, flex: 1 }} numberOfLines={1}>
                      {folder}
                    </Text>
                    <Text style={{ color: theme.colors.primary, fontSize: 12.5 }}>
                      → {profileName(pid)}
                    </Text>
                    <Pressable hitSlop={8} onPress={() => void setRule(folder, null).then(reload)}>
                      <Text style={{ color: theme.colors.error, paddingHorizontal: 8 }}>✕</Text>
                    </Pressable>
                  </View>
                ))
              )}
              <View style={{ height: 10 }} />
              <TextField
                value={ruleFolder}
                onChangeText={setRuleFolder}
                placeholder="Folder name (e.g. Screenshots)"
                theme={theme}
              />
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                {profiles.map((p) => (
                  <Pressable
                    key={p.id}
                    onPress={() => setRuleProfileId(p.id)}
                    style={[
                      styles.chip,
                      {
                        backgroundColor:
                          ruleProfileId === p.id ? theme.colors.primaryContainer : theme.colors.surfaceHighest,
                      },
                    ]}
                  >
                    <Text
                      style={{
                        color:
                          ruleProfileId === p.id ? theme.colors.onPrimaryContainer : theme.colors.onSurface,
                        fontSize: 12,
                        fontWeight: "600",
                      }}
                    >
                      {p.name}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <View style={{ flexDirection: "row", justifyContent: "flex-end", marginTop: 10 }}>
                <Button
                  title="Add rule"
                  variant="outlined"
                  theme={theme}
                  disabled={!ruleFolder.trim() || !ruleProfileId}
                  onPress={async () => {
                    await setRule(ruleFolder.trim(), ruleProfileId);
                    setRuleFolder("");
                    setRuleProfileId(null);
                    reload();
                  }}
                />
              </View>
            </Card>

            <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 11.5, marginTop: 12, lineHeight: 17 }}>
              Experimental. Bot tokens are stored only on this device — after restoring a database
              backup on a new phone, re-enter each destination's token here. Photos remember which
              destination they live on, so browsing, restore and delete keep working.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <Card theme={theme} style={{ marginBottom: 10 }}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.colors.onSurface, fontWeight: "700" }}>{item.name}</Text>
                <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 12 }}>
                  {item.channelTitle ?? item.channelId}
                </Text>
              </View>
              <Pressable hitSlop={8} onPress={() => confirmDelete(item)}>
                <Text style={{ color: theme.colors.error, fontWeight: "600" }}>Remove</Text>
              </Pressable>
            </View>
          </Card>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingBottom: 8,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    flex: 1,
    fontSize: 20,
    fontWeight: "800",
  },
  ruleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 6,
  },
  chip: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
});
