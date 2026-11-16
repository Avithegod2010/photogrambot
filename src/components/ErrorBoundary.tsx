import React from "react";
import { StyleSheet, Text, View } from "../rn";
import { useTheme } from "../useTheme";
import { Button } from "./ui";
import { WarningIcon } from "./icons";
import { radius, spacing, typography, type AppTheme } from "../theme";

/**
 * Last-resort UI safety net. A render error anywhere below this point shows a
 * calm recovery screen instead of a blank window. Nothing is written or
 * deleted here — the archive is untouched; the user can retry the render.
 */
class Boundary extends React.Component<
  { theme: AppTheme; children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    // The global crash handler already records this in the diagnostics ring
    // buffer; avoid importing it here so a failure in that module cannot
    // cascade into the boundary itself.
    if (__DEV__) console.error("PhotogramBot render error", error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    const { theme } = this.props;
    return (
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <WarningIcon color={theme.colors.error} size={44} />
        <Text
          accessibilityRole="header"
          style={[typography.title, { color: theme.colors.onSurface, textAlign: "center", marginTop: spacing.lg }]}
        >
          Something went wrong on this screen
        </Text>
        <Text
          style={[
            typography.small,
            {
              color: theme.colors.onSurfaceVariant,
              textAlign: "center",
              marginTop: spacing.sm,
              maxWidth: 320,
            },
          ]}
        >
          Your photos and channel archive are safe. This is a display problem, not a backup problem.
        </Text>
        <Button
          title="Try again"
          theme={theme}
          style={{ marginTop: spacing.xl, minWidth: 180 }}
          onPress={() => this.setState({ error: null })}
        />
        {__DEV__ ? (
          <Text
            style={[typography.caption, { color: theme.colors.onSurfaceVariant, marginTop: spacing.lg, textAlign: "center" }]}
            numberOfLines={6}
          >
            {this.state.error.message}
          </Text>
        ) : null}
      </View>
    );
  }
}

export function ErrorBoundary({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  return <Boundary theme={theme}>{children}</Boundary>;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xxl,
    borderRadius: radius.card,
  },
});
