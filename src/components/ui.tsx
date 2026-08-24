import React from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  Switch,
  Text,
  TextInput,
  View,
  type ViewStyle,
  type TextStyle,
  StyleSheet,
} from "react-native";
import type { AppTheme } from "../theme";

export function Button({
  title,
  onPress,
  theme,
  variant = "filled",
  disabled,
  busy,
  style,
}: {
  title: string;
  onPress?: () => void;
  theme: AppTheme;
  variant?: "filled" | "outlined" | "text" | "danger";
  disabled?: boolean;
  busy?: boolean;
  style?: ViewStyle;
}) {
  const bg =
    variant === "filled"
      ? theme.colors.primary
      : variant === "danger"
        ? theme.colors.errorContainer
        : "transparent";
  const fg =
    variant === "filled"
      ? theme.colors.onPrimary
      : variant === "danger"
        ? theme.colors.error
        : theme.colors.primary;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || busy}
      style={[
        styles.button,
        { backgroundColor: bg },
        variant !== "filled" && variant !== "danger" && { borderWidth: 1, borderColor: theme.colors.outline },
        (disabled || busy) && { opacity: 0.5 },
        style,
      ]}
    >
      {busy ? (
        <ActivityIndicator size="small" color={fg} />
      ) : (
        <Text style={[styles.buttonText, { color: fg }]}>{title}</Text>
      )}
    </Pressable>
  );
}

export function Card({
  children,
  theme,
  style,
  onPress,
}: {
  children: React.ReactNode;
  theme: AppTheme;
  style?: ViewStyle;
  onPress?: () => void;
}) {
  const content = (
    <View style={[styles.card, { backgroundColor: theme.colors.surface }, style]}>
      {children}
    </View>
  );
  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [{ opacity: pressed ? 0.85 : 1 }]}>
        {content}
      </Pressable>
    );
  }
  return content;
}

export function TextField({
  value,
  onChangeText,
  placeholder,
  theme,
  secureTextEntry,
  multiline,
  style,
  keyboardType,
  autoCapitalize = "none",
}: {
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  theme: AppTheme;
  secureTextEntry?: boolean;
  multiline?: boolean;
  style?: TextStyle;
  keyboardType?: "default" | "numeric";
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
}) {
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={theme.colors.onSurfaceVariant}
      secureTextEntry={secureTextEntry}
      multiline={multiline}
      keyboardType={keyboardType}
      autoCapitalize={autoCapitalize}
      autoCorrect={false}
      selectionColor={theme.colors.primary}
      style={[
        styles.textField,
        {
          backgroundColor: theme.colors.surfaceContainer,
          color: theme.colors.onSurface,
          borderColor: theme.colors.outline,
        },
        style,
      ]}
    />
  );
}

export function ToggleRow({
  title,
  subtitle,
  value,
  onChange,
  theme,
}: {
  title: string;
  subtitle?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  theme: AppTheme;
}) {
  return (
    <View style={styles.toggleRow}>
      <View style={styles.toggleText}>
        <Text style={[styles.rowTitle, { color: theme.colors.onSurface }]}>{title}</Text>
        {subtitle ? (
          <Text style={[styles.rowSubtitle, { color: theme.colors.onSurfaceVariant }]}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: theme.colors.surfaceHighest, true: theme.colors.primaryContainer }}
        thumbColor={value ? theme.colors.primary : theme.colors.onSurfaceVariant}
      />
    </View>
  );
}

export function Dialog({
  visible,
  title,
  message,
  theme,
  children,
}: {
  visible: boolean;
  title: string;
  message?: string;
  theme: AppTheme;
  children?: React.ReactNode;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => {}}>
      <View style={[styles.dialogScrim, { backgroundColor: theme.colors.scrim }]}>
        <View style={[styles.dialogCard, { backgroundColor: theme.colors.surfaceContainer }]}>
          <Text style={[styles.dialogTitle, { color: theme.colors.onSurface }]}>{title}</Text>
          {message ? (
            <Text style={[styles.dialogMessage, { color: theme.colors.onSurfaceVariant }]}>
              {message}
            </Text>
          ) : null}
          {children}
        </View>
      </View>
    </Modal>
  );
}

export function SectionLabel({ text, theme }: { text: string; theme: AppTheme }) {
  return (
    <Text style={[styles.sectionLabel, { color: theme.colors.onSurfaceVariant }]}>{text}</Text>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: 999,
    paddingVertical: 12,
    paddingHorizontal: 24,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
  },
  buttonText: {
    fontSize: 15,
    fontWeight: "600",
  },
  card: {
    borderRadius: 20,
    padding: 16,
  },
  textField: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
  },
  toggleText: {
    flex: 1,
    paddingRight: 12,
  },
  rowTitle: {
    fontSize: 16,
    fontWeight: "500",
  },
  rowSubtitle: {
    fontSize: 13,
    marginTop: 2,
    lineHeight: 18,
  },
  dialogScrim: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  dialogCard: {
    width: "100%",
    maxWidth: 360,
    borderRadius: 24,
    padding: 24,
  },
  dialogTitle: {
    fontSize: 18,
    fontWeight: "700",
  },
  dialogMessage: {
    fontSize: 14,
    marginTop: 8,
    lineHeight: 20,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 8,
    marginTop: 16,
  },
});
