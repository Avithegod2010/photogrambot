import React, { useRef, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from "../rn";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../useTheme";
import { getAiApiKey, loadPrefs } from "../lib/settings";
import { searchPhotos, type PhotoRow } from "../lib/db";
import { searchSemantic } from "../lib/semsearch";
import { askPhotos } from "../lib/ai";
import { TelegramImage, resolvePhotoThumb } from "../components/TelegramImage";
import { EmptySearchArt } from "../components/illustrations";
import { formatDate } from "../lib/format";
import { isDecoyActive } from "../lib/applock";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  photos?: PhotoRow[];
}

export function AskScreen({ navigation }: { navigation: any }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const listRef = useRef<FlatList<ChatMessage>>(null);

  async function send() {
    const question = draft.trim();
    if (!question || busy) return;
    setDraft("");
    setBusy(true);
    setMessages((prev) => [
      ...prev,
      { id: `u_${Date.now()}`, role: "user", text: question },
    ]);
    try {
      const apiKey = await getAiApiKey();
      if (!apiKey) {
        setMessages((prev) => [
          ...prev,
          {
            id: `a_${Date.now()}`,
            role: "assistant",
            text: "Add your Gemini API key in Settings → AI captions to ask questions about your library.",
          },
        ]);
        return;
      }
      const { aiModel } = await loadPrefs();
      const model = aiModel || "gemini-2.5-flash";
      // Candidate set: FTS first, then semantic (if indexed), then recent.
      let candidates = await searchPhotos(question, undefined, 20).catch(() => [] as PhotoRow[]);
      if (candidates.length === 0) {
        candidates = await searchSemantic(apiKey, question, 20).catch(() => [] as PhotoRow[]);
      }
      if (candidates.length === 0) {
        candidates = await searchPhotos("", undefined, 20).catch(() => [] as PhotoRow[]);
      }
      if (candidates.length === 0) {
        setMessages((prev) => [
          ...prev,
          {
            id: `a_${Date.now()}`,
            role: "assistant",
            text: "I couldn't find any indexed photos to search yet.",
          },
        ]);
        return;
      }
      const index = candidates
        .map(
          (p) =>
            `[${p.id}] ${p.filename} | ${formatDate(p.taken_at)} | ` +
            `${p.folder ?? ""} | ${p.ai_caption ?? ""} | ${(p.ocr_text ?? "").slice(0, 200)}`
        )
        .join("\n")
        .replace(/[\u0000-\u001f\u007f]/g, " ");
      const answer = await askPhotos({ apiKey, model, question, index });
      const cited = new Set<string>();
      for (const match of answer.matchAll(/\[([^\]]+)\]/g)) {
        cited.add(match[1]);
      }
      const photos = candidates.filter((p) => cited.has(p.id)).slice(0, 8);
      setMessages((prev) => [
        ...prev,
        { id: `a_${Date.now()}`, role: "assistant", text: answer, photos },
      ]);
    } catch (e: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: `a_${Date.now()}`,
          role: "assistant",
          text: e?.message ?? "Couldn't answer that right now.",
        },
      ]);
    } finally {
      setBusy(false);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background, paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          accessibilityLabel="Back"
          accessibilityRole="button"
        >
          <Text style={{ color: theme.colors.onSurface, fontSize: 20 }}>←</Text>
        </Pressable>
        <Text style={[styles.title, { color: theme.colors.onSurface }]}>Ask your photos</Text>
        <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 11 }}>Gemini</Text>
      </View>

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 20 }}
        ListEmptyComponent={
          <View style={{ alignItems: "center", paddingTop: 40 }}>
            <EmptySearchArt
              color={theme.colors.onSurfaceVariant}
              accent={theme.colors.primary}
              size={104}
            />
            <Text style={[styles.emptyTitle, { color: theme.colors.onSurface }]}>
              Chat with your library
            </Text>
            <Text style={[styles.emptyText, { color: theme.colors.onSurfaceVariant }]}>
              Ask things like "when was the last time I was at the beach?" or
              "which receipts did I photograph in 2025?". Answers cite photos you can open.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <View
            style={[
              styles.bubble,
              {
                backgroundColor:
                  item.role === "user" ? theme.colors.primaryContainer : theme.colors.surface,
                alignSelf: item.role === "user" ? "flex-end" : "flex-start",
              },
            ]}
          >
            <Text
              style={{
                color:
                  item.role === "user"
                    ? theme.colors.onPrimaryContainer
                    : theme.colors.onSurface,
                fontSize: 13.5,
                lineHeight: 20,
              }}
            >
              {item.text}
            </Text>
            {item.photos && item.photos.length > 0 ? (
              <View style={{ flexDirection: "row", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                {item.photos.map((p) => {
                  const thumb = resolvePhotoThumb(p);
                  return (
                    <Pressable
                      key={p.id}
                      onPress={() =>
                        navigation.navigate("Viewer", { photos: item.photos ?? [], index: 0 })
                      }
                    >
                      <TelegramImage
                        fileId={thumb.fileId}
                        localUri={thumb.localUri}
                        profileId={p.profile_id}
                        style={{ width: 54, height: 54, borderRadius: 8 }}
                      />
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
          </View>
        )}
      />

      <View
        style={[
          styles.inputRow,
          {
            backgroundColor: theme.colors.surfaceContainer,
            paddingBottom: insets.bottom + 8,
          },
        ]}
      >
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Ask about your photos…"
          placeholderTextColor={theme.colors.onSurfaceVariant}
          style={[styles.input, { color: theme.colors.onSurface }]}
          selectionColor={theme.colors.primary}
          multiline
          onSubmitEditing={() => void send()}
        />
        <Pressable
          onPress={() => void send()}
          disabled={busy || !draft.trim()}
          style={[styles.sendBtn, { backgroundColor: theme.colors.primary, opacity: busy || !draft.trim() ? 0.5 : 1 }]}
          accessibilityLabel="Send question"
          accessibilityRole="button"
        >
          {busy ? (
            <ActivityIndicator size="small" color={theme.colors.onPrimary} />
          ) : (
            <Text style={{ color: theme.colors.onPrimary, fontWeight: "800" }}>↑</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingBottom: 8 },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  title: { flex: 1, fontSize: 20, fontWeight: "800" },
  emptyTitle: { fontSize: 17, fontWeight: "700", marginTop: 10 },
  emptyText: { fontSize: 13, lineHeight: 19, textAlign: "center", padding: 16 },
  bubble: { borderRadius: 16, padding: 12, maxWidth: "88%" },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  input: { flex: 1, maxHeight: 110, fontSize: 14.5, paddingVertical: 10 },
  sendBtn: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
});
