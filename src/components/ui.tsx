import React, { useEffect } from "react";
import {
  ActivityIndicator,
  I18nManager,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ColorValue,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "../rn";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  elevation,
  motion,
  overlay,
  radius,
  spacing,
  STATUS_LABELS,
  touchTarget,
  typography,
  type AppTheme,
  type StatusKind,
} from "../theme";
import { useReducedMotion } from "../useReducedMotion";
import { hapticImpact, hapticSelection } from "../lib/haptics";
import {
  ArrowLeftIcon,
  CheckIcon,
  ChevronRightIcon,
  CloseIcon,
  SearchIcon,
  WarningIcon,
} from "./icons";

/* ------------------------------------------------------------------------- *
 * Shared UI primitives.
 *
 * Rules enforced here so screens stay consistent:
 *  - every interactive element is >= 48 dp and carries role + state
 *  - colour always comes from AppTheme (or the overlay tokens)
 *  - type, spacing, radius and motion come from the token scales
 * ------------------------------------------------------------------------- */

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function usePressScale(disabled?: boolean) {
  const reduce = useReducedMotion();
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return {
    animatedStyle,
    onPressIn: () => {
      if (!reduce && !disabled) {
        scale.value = withTiming(0.97, { duration: motion.fast });
      }
    },
    onPressOut: () => {
      scale.value = withTiming(1, { duration: motion.fast });
    },
  };
}

function isDynamicColor(value: ColorValue | undefined): boolean {
  return value != null && typeof value !== "string";
}
/**
 * Material ripple on every pressable, in every theme. The ripple colour is a
 * neutral string because Android's ripple layer does not accept the dynamic
 * PlatformColor values used by Material You.
 */
function rippleFor(_background?: ColorValue) {
  return { color: overlay.ripple, borderless: false };
}

function textColor(value: ColorValue): string | ColorValue {
  return value;
}

/** Wrap a handler with one haptic, matching the weight of the action. */
function withHaptic(
  fn: (() => void) | undefined,
  kind: "none" | "light" | "selection" | "medium"
): (() => void) | undefined {
  if (!fn) return undefined;
  if (kind === "none") return fn;
  return () => {
    if (kind === "selection") hapticSelection();
    else hapticImpact(kind);
    fn();
  };
}

/* ------------------------------- Buttons -------------------------------- */

export function Button({
  title,
  onPress,
  theme,
  variant = "filled",
  disabled,
  busy,
  style,
  accessibilityLabel,
}: {
  title: string;
  onPress?: () => void;
  theme: AppTheme;
  variant?: "filled" | "tonal" | "outlined" | "text" | "danger";
  disabled?: boolean;
  busy?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const bg =
    variant === "filled"
      ? theme.colors.primary
      : variant === "tonal"
        ? theme.colors.secondaryContainer
        : variant === "danger"
          ? theme.colors.errorContainer
          : "transparent";
  const fg =
    variant === "filled"
      ? theme.colors.onPrimary
      : variant === "tonal"
        ? theme.colors.onSecondaryContainer
        : variant === "danger"
          ? theme.colors.error
          : theme.colors.primary;
  const press = usePressScale(disabled || busy);
  const handlePress = withHaptic(
    onPress,
    variant === "text" ? "none" : variant === "danger" ? "medium" : "light"
  );
  return (
    <AnimatedPressable
      onPress={handlePress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      disabled={disabled || busy}
      android_ripple={rippleFor(bg)}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: !!(disabled || busy), busy: !!busy }}
      style={[
        styles.button,
        { backgroundColor: bg },
        variant === "outlined" && {
          borderWidth: 1,
          borderColor: theme.colors.outline,
        },
        (disabled || busy) && { opacity: 0.45 },
        press.animatedStyle,
        style,
      ]}
    >
      {busy ? (
        <ActivityIndicator size="small" color={textColor(fg)} />
      ) : (
        <Text style={[typography.bodyStrong, { color: fg }]} numberOfLines={1}>
          {title}
        </Text>
      )}
    </AnimatedPressable>
  );
}

export function IconButton({
  icon,
  label,
  onPress,
  theme,
  disabled,
  selected,
  variant = "plain",
  style,
  testID,
}: {
  icon: React.ReactNode;
  label: string;
  onPress?: () => void;
  theme: AppTheme;
  disabled?: boolean;
  selected?: boolean;
  variant?: "plain" | "tonal" | "primary";
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const bg =
    variant === "tonal"
      ? theme.colors.surfaceContainer
      : variant === "primary" || selected
        ? theme.colors.primaryContainer
        : "transparent";
  const press = usePressScale(disabled);
  return (
    <AnimatedPressable
      onPress={withHaptic(onPress, "light")}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      disabled={disabled}
      android_ripple={{ color: overlay.ripple, borderless: true, radius: touchTarget / 2 }}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled, selected: !!selected }}
      testID={testID}
      style={[
        styles.iconButton,
        { backgroundColor: bg },
        disabled && { opacity: 0.45 },
        press.animatedStyle,
        style,
      ]}
    >
      {icon}
    </AnimatedPressable>
  );
}

/* -------------------------------- Cards --------------------------------- */

export function Card({
  children,
  theme,
  style,
  onPress,
  accessibilityLabel,
}: {
  children: React.ReactNode;
  theme: AppTheme;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  accessibilityLabel?: string;
}) {
  const content = (
    <View style={[styles.card, { backgroundColor: theme.colors.surface }, style]}>{children}</View>
  );
  if (!onPress) return content;
  return (
    <Pressable
      onPress={onPress}
      android_ripple={rippleFor(theme.colors.surface)}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? "Open"}
      style={({ pressed }) => [{ borderRadius: radius.card, overflow: "hidden" }, pressed && { opacity: 0.9 }]}
    >
      {content}
    </Pressable>
  );
}

/* -------------------------------- Inputs -------------------------------- */

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
  onEndEditing,
  onBlur,
  label,
  hint,
  error,
  accessibilityLabel,
  onSubmitEditing,
  returnKeyType,
  editable = true,
  trailing,
}: {
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  theme: AppTheme;
  secureTextEntry?: boolean;
  multiline?: boolean;
  style?: StyleProp<TextStyle>;
  keyboardType?: "default" | "numeric" | "email-address" | "phone-pad" | "url";
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  onEndEditing?: () => void;
  onBlur?: () => void;
  label?: string;
  hint?: string;
  error?: string | null;
  accessibilityLabel?: string;
  onSubmitEditing?: () => void;
  returnKeyType?: "done" | "search" | "next" | "go";
  editable?: boolean;
  trailing?: React.ReactNode;
}) {
  return (
    <View style={styles.fieldWrap}>
      {label ? (
        <Text style={[typography.label, { color: theme.colors.onSurfaceVariant, marginBottom: spacing.xs }]}>
          {label}
        </Text>
      ) : null}
      <View
        style={[
          styles.textFieldShell,
          {
            backgroundColor: theme.colors.surfaceContainer,
            borderColor: error ? theme.colors.error : theme.colors.outlineVariant,
          },
        ]}
      >
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
          editable={editable}
          onEndEditing={onEndEditing}
          onBlur={onBlur}
          onSubmitEditing={onSubmitEditing}
          returnKeyType={returnKeyType}
          selectionColor={theme.colors.primary}
          accessibilityLabel={accessibilityLabel ?? label ?? placeholder}
          accessibilityHint={hint}
          accessibilityState={{ disabled: !editable }}
          style={[
            styles.textField,
            { minHeight: multiline ? 96 : touchTarget, textAlignVertical: multiline ? "top" : "center" },
            { color: theme.colors.onSurface },
            style,
          ]}
        />
        {trailing ? <View style={styles.fieldTrailing}>{trailing}</View> : null}
      </View>
      {error ? (
        <Text
          accessibilityLiveRegion="polite"
          style={[typography.small, { color: theme.colors.error, marginTop: spacing.xs }]}
        >
          {error}
        </Text>
      ) : hint ? (
        <Text style={[typography.small, { color: theme.colors.onSurfaceVariant, marginTop: spacing.xs }]}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

export function SearchField({
  value,
  onChangeText,
  placeholder,
  theme,
  onSubmitEditing,
  style,
  accessibilityLabel,
}: {
  value: string;
  onChangeText: (t: string) => void;
  placeholder: string;
  theme: AppTheme;
  onSubmitEditing?: () => void;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  return (
    <View
      style={[
        styles.searchField,
        { backgroundColor: theme.colors.surfaceContainer },
        style,
      ]}
    >
      <SearchIcon color={theme.colors.onSurfaceVariant} size={20} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.onSurfaceVariant}
        selectionColor={theme.colors.primary}
        onSubmitEditing={onSubmitEditing}
        returnKeyType="search"
        accessibilityLabel={accessibilityLabel ?? placeholder}
        style={[styles.searchInput, { color: theme.colors.onSurface }]}
      />
      {value.length > 0 ? (
        <IconButton
          icon={<CloseIcon color={theme.colors.onSurfaceVariant} size={18} />}
          label="Clear search"
          theme={theme}
          onPress={() => onChangeText("")}
          style={styles.searchClear}
        />
      ) : null}
    </View>
  );
}

export function ToggleRow({
  title,
  subtitle,
  value,
  onChange,
  theme,
  disabled,
  accessibilityLabel,
}: {
  title: string;
  subtitle?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  theme: AppTheme;
  disabled?: boolean;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      onPress={() => {
        if (!disabled) {
          hapticSelection();
          onChange(!value);
        }
      }}
      disabled={disabled}
      android_ripple={rippleFor(theme.colors.surface)}
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityHint={subtitle}
      accessibilityState={{ checked: value, disabled: !!disabled }}
      style={[styles.toggleRow, disabled && { opacity: 0.5 }]}
    >
      <View style={styles.toggleText}>
        <Text style={[typography.body, { color: theme.colors.onSurface }]}>{title}</Text>
        {subtitle ? (
          <Text
            style={[
              typography.small,
              { color: theme.colors.onSurfaceVariant, marginTop: 2 },
            ]}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>
      {/* Visual only: the row above is the single TalkBack stop. */}
      <View pointerEvents="none" importantForAccessibility="no-hide-descendants" accessible={false}>
        <SwitchVisual value={value} theme={theme} />
      </View>
    </Pressable>
  );
}

// Material 3 switch: a 52×32 track, a thumb that slides, and a check mark on
// the thumb when on. The row above is the single TalkBack stop.
function SwitchVisual({ value, theme }: { value: boolean; theme: AppTheme }) {
  const reduce = useReducedMotion();
  const t = useSharedValue(value ? 1 : 0);
  useEffect(() => {
    t.value = withTiming(value ? 1 : 0, {
      duration: reduce ? 0 : motion.base,
      easing: Easing.bezier(...motion.easing),
    });
  }, [value, reduce, t]);
  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: t.value * 20 }],
  }));
  return (
    <View
      style={[
        styles.switchTrack,
        {
          backgroundColor: value ? theme.colors.primary : theme.colors.surfaceHighest,
          borderColor: value ? theme.colors.primary : theme.colors.outline,
        },
      ]}
    >
      <Animated.View
        style={[
          styles.switchThumb,
          { backgroundColor: value ? theme.colors.onPrimary : theme.colors.onSurfaceVariant },
          thumbStyle,
        ]}
      >
        <View style={{ opacity: value ? 1 : 0 }}>
          <CheckIcon color={theme.colors.primary} size={14} />
        </View>
      </Animated.View>
    </View>
  );
}

/* -------------------------------- Rows ---------------------------------- */

export function ListRow({
  title,
  subtitle,
  leading,
  trailing,
  onPress,
  theme,
  destructive,
  disabled,
  accessibilityLabel,
  showChevron,
  style,
}: {
  title: string;
  subtitle?: string;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  onPress?: () => void;
  theme: AppTheme;
  destructive?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
  showChevron?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const body = (
    <>
      {leading ? <View style={styles.rowLeading}>{leading}</View> : null}
      <View style={styles.rowText}>
        <Text
          style={[
            typography.body,
            { color: destructive ? theme.colors.error : theme.colors.onSurface },
          ]}
          numberOfLines={2}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text
            style={[typography.small, { color: theme.colors.onSurfaceVariant, marginTop: 2 }]}
            numberOfLines={3}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing}
      {showChevron ? (
        <View style={I18nManager.isRTL ? { transform: [{ scaleX: -1 }] } : undefined}>
          <ChevronRightIcon color={theme.colors.onSurfaceVariant} size={20} />
        </View>
      ) : null}
    </>
  );

  if (!onPress) {
    return <View style={[styles.listRow, style]}>{body}</View>;
  }
  return (
    <Pressable
      onPress={withHaptic(onPress, "light")}
      disabled={disabled}
      android_ripple={rippleFor(theme.colors.surface)}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? (subtitle ? `${title}, ${subtitle}` : title)}
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [
        styles.listRow,
        disabled && { opacity: 0.45 },
        pressed && { backgroundColor: theme.colors.surfaceContainer },
        style,
      ]}
    >
      {body}
    </Pressable>
  );
}

/* ------------------------------ Structure -------------------------------- */

export function SectionLabel({
  text,
  theme,
  action,
  onLayout,
}: {
  text: string;
  theme: AppTheme;
  action?: React.ReactNode;
  onLayout?: (e: import("react-native").LayoutChangeEvent) => void;
}) {
  return (
    <View style={styles.sectionLabelRow} onLayout={onLayout}>
      <Text
        accessibilityRole="header"
        style={[typography.label, { color: theme.colors.onSurfaceVariant, flex: 1 }]}
      >
        {text}
      </Text>
      {action}
    </View>
  );
}

export function Section({
  title,
  actionLabel,
  onAction,
  children,
  theme,
  style,
}: {
  title?: string;
  actionLabel?: string;
  onAction?: () => void;
  children: React.ReactNode;
  theme: AppTheme;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.section, style]}>
      {title ? (
        <SectionLabel
          text={title}
          theme={theme}
          action={
            actionLabel && onAction ? (
              <Pressable
                onPress={onAction}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={actionLabel}
                style={styles.sectionAction}
              >
                <Text style={[typography.label, { color: theme.colors.primary }]}>
                  {actionLabel}
                </Text>
              </Pressable>
            ) : null
          }
        />
      ) : null}
      {children}
    </View>
  );
}

export function Divider({
  theme,
  inset = 0,
}: {
  theme: AppTheme;
  inset?: number;
}) {
  return (
    <View
      style={{
        height: StyleSheet.hairlineWidth,
        backgroundColor: theme.colors.outlineVariant,
        marginStart: inset,
      }}
    />
  );
}

export function Screen({
  children,
  theme,
  style,
  safeTop,
}: {
  children: React.ReactNode;
  theme: AppTheme;
  style?: StyleProp<ViewStyle>;
  safeTop?: boolean;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.screen,
        {
          backgroundColor: theme.colors.background,
          paddingTop: safeTop ? insets.top : 0,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function AppBar({
  title,
  subtitle,
  onBack,
  right,
  theme,
  borderless,
  safeTop = true,
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  right?: React.ReactNode;
  theme: AppTheme;
  borderless?: boolean;
  safeTop?: boolean;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.appBar,
        {
          paddingTop: safeTop ? insets.top : 0,
          backgroundColor: theme.colors.background,
          borderBottomColor: theme.colors.outlineVariant,
        },
        borderless && { borderBottomWidth: 0 },
      ]}
    >
      <View style={styles.appBarRow}>
        {onBack ? (
          <IconButton
            icon={
              <View style={I18nManager.isRTL ? { transform: [{ scaleX: -1 }] } : undefined}>
                <ArrowLeftIcon color={theme.colors.onSurface} size={22} />
              </View>
            }
            label="Back"
            theme={theme}
            onPress={onBack}
          />
        ) : (
          <View style={{ width: touchTarget }} />
        )}
        <View style={styles.appBarText}>
          <Text
            accessibilityRole="header"
            numberOfLines={1}
            style={[typography.title, { color: theme.colors.onSurface }]}
          >
            {title}
          </Text>
          {subtitle ? (
            <Text
              numberOfLines={1}
              style={[typography.caption, { color: theme.colors.onSurfaceVariant }]}
            >
              {subtitle}
            </Text>
          ) : null}
        </View>
        {right ?? <View style={{ width: touchTarget }} />}
      </View>
    </View>
  );
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  theme,
  accessibilityLabel,
}: {
  options: { key: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  theme: AppTheme;
  accessibilityLabel?: string;
}) {
  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel}
      style={[styles.segmented, { backgroundColor: theme.colors.surfaceContainer }]}
    >
      {options.map((o) => (
        <Segment
          key={o.key}
          label={o.label}
          active={o.key === value}
          theme={theme}
          onPress={() => onChange(o.key)}
        />
      ))}
    </View>
  );
}

function Segment({
  label,
  active,
  onPress,
  theme,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  theme: AppTheme;
}) {
  const reduce = useReducedMotion();
  const t = useSharedValue(active ? 1 : 0);
  useEffect(() => {
    t.value = withTiming(active ? 1 : 0, {
      duration: reduce ? 0 : motion.base,
      easing: Easing.bezier(...motion.easing),
    });
  }, [active, reduce, t]);
  const scaleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 0.97 + t.value * 0.03 }],
  }));
  return (
    <Pressable
      onPress={() => {
        hapticSelection();
        onPress();
      }}
      android_ripple={{ color: overlay.ripple, borderless: false }}
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      style={[styles.segment, active && { backgroundColor: theme.colors.primaryContainer }]}
    >
      <Animated.View style={[styles.segmentInner, scaleStyle]}>
        {active ? (
          <CheckIcon color={theme.colors.onPrimaryContainer} size={15} />
        ) : null}
        <Text
          numberOfLines={1}
          style={[
            typography.label,
            {
              color: active ? theme.colors.onPrimaryContainer : theme.colors.onSurfaceVariant,
              fontWeight: active ? "700" : "500",
            },
          ]}
        >
          {label}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

/* ------------------------------ Feedback -------------------------------- */

export function Chip({
  label,
  selected,
  onPress,
  theme,
  icon,
  disabled,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  theme: AppTheme;
  icon?: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={withHaptic(onPress, "selection")}
      disabled={disabled}
      hitSlop={{ top: 6, bottom: 6 }}
      android_ripple={{ color: overlay.ripple, borderless: false }}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!selected, disabled: !!disabled }}
      style={[
        styles.chip,
        {
          backgroundColor: selected ? theme.colors.primaryContainer : theme.colors.surfaceContainer,
          borderColor: selected ? theme.colors.primary : theme.colors.outlineVariant,
        },
        disabled && { opacity: 0.45 },
      ]}
    >
      {selected ? (
        <CheckIcon color={theme.colors.onPrimaryContainer} size={15} />
      ) : (
        icon
      )}
      <Text
        numberOfLines={1}
        style={[
          typography.label,
          {
            color: selected ? theme.colors.onPrimaryContainer : theme.colors.onSurfaceVariant,
            fontWeight: selected ? "700" : "500",
          },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function Badge({
  label,
  tone = "neutral",
  theme,
  icon,
}: {
  label: string;
  tone?: "neutral" | "accent" | "success" | "error";
  theme: AppTheme;
  icon?: React.ReactNode;
}) {
  const bg =
    tone === "accent"
      ? theme.colors.primaryContainer
      : tone === "success"
        ? theme.colors.success
        : tone === "error"
          ? theme.colors.errorContainer
          : theme.colors.surfaceHighest;
  const fg =
    tone === "accent"
      ? theme.colors.onPrimaryContainer
      : tone === "success"
        ? theme.colors.background
        : tone === "error"
          ? theme.colors.error
          : theme.colors.onSurfaceVariant;
  return (
    <View style={[styles.badge, { backgroundColor: bg }]} accessible accessibilityLabel={label}>
      {icon}
      <Text style={[typography.caption, { color: fg, fontWeight: "600" }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/** Semantic colour per status — used by badges, pills and queue rows. */
export function statusColor(theme: AppTheme, status: StatusKind): ColorValue {
  switch (status) {
    case "backed_up":
    case "restored":
      return theme.colors.success;
    case "uploading":
      return theme.colors.primary;
    case "failed":
      return theme.colors.error;
    case "local":
    case "queued":
    case "duplicate":
    default:
      return theme.colors.onSurfaceVariant;
  }
}

export function StatusPill({
  status,
  theme,
  label,
}: {
  status: StatusKind;
  theme: AppTheme;
  label?: string;
}) {
  const color = statusColor(theme, status);
  const text = label ?? STATUS_LABELS[status];
  return (
    <View
      accessible
      accessibilityLabel={text}
      style={[styles.statusPill, { backgroundColor: theme.colors.surfaceHighest }]}
    >
      <View style={[styles.statusDot, { backgroundColor: color }]} />
      <Text style={[typography.caption, { color, fontWeight: "600" }]} numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
}

export function ProgressBar({
  value,
  theme,
  label,
  indeterminate,
}: {
  /** 0..1 */
  value: number;
  theme: AppTheme;
  label?: string;
  indeterminate?: boolean;
}) {
  const pct = Math.max(0, Math.min(1, value));
  const reduce = useReducedMotion();
  const width = useSharedValue(indeterminate ? 35 : Math.round(pct * 100));
  useEffect(() => {
    width.value = withTiming(indeterminate ? 35 : Math.round(pct * 100), {
      duration: reduce ? 0 : motion.base,
      easing: Easing.bezier(...motion.easing),
    });
  }, [pct, indeterminate, reduce, width]);
  const fillStyle = useAnimatedStyle(() => ({ width: `${width.value}%` }));
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={label ?? "Progress"}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(pct * 100) }}
      style={[styles.progressTrack, { backgroundColor: theme.colors.surfaceHighest }]}
    >
      <Animated.View
        style={[styles.progressFill, { backgroundColor: theme.colors.primary }, fillStyle]}
      />
    </View>
  );
}

export function Stat({
  label,
  value,
  theme,
  hint,
}: {
  label: string;
  value: string;
  theme: AppTheme;
  hint?: string;
}) {
  return (
    <View accessible accessibilityLabel={`${label}: ${value}${hint ? `, ${hint}` : ""}`}>
      <Text style={[typography.caption, { color: theme.colors.onSurfaceVariant }]} numberOfLines={1}>
        {label}
      </Text>
      <Text style={[typography.section, { color: theme.colors.onSurface }]} numberOfLines={1}>
        {value}
      </Text>
      {hint ? (
        <Text style={[typography.caption, { color: theme.colors.onSurfaceVariant }]} numberOfLines={1}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

export function EmptyState({
  title,
  message,
  actionLabel,
  onAction,
  theme,
  art,
  compact,
  secondaryActionLabel,
  onSecondaryAction,
}: {
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  theme: AppTheme;
  art?: React.ReactNode;
  compact?: boolean;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
}) {
  return (
    <View style={[styles.emptyState, compact && { paddingVertical: spacing.xl }]}>
      {art ? <View style={{ marginBottom: spacing.md }}>{art}</View> : null}
      <Text
        accessibilityRole="header"
        style={[typography.section, { color: theme.colors.onSurface, textAlign: "center" }]}
      >
        {title}
      </Text>
      {message ? (
        <Text
          style={[
            typography.small,
            {
              color: theme.colors.onSurfaceVariant,
              textAlign: "center",
              marginTop: spacing.sm,
              maxWidth: 340,
            },
          ]}
        >
          {message}
        </Text>
      ) : null}
      {actionLabel && onAction ? (
        <Button
          title={actionLabel}
          onPress={onAction}
          theme={theme}
          variant="tonal"
          style={{ marginTop: spacing.lg, minWidth: 180 }}
        />
      ) : null}
      {secondaryActionLabel && onSecondaryAction ? (
        <Button
          title={secondaryActionLabel}
          onPress={onSecondaryAction}
          theme={theme}
          variant="text"
          style={{ marginTop: spacing.sm, minWidth: 180 }}
        />
      ) : null}
    </View>
  );
}

export function ErrorState({
  title,
  message,
  onRetry,
  theme,
  retryLabel = "Try again",
}: {
  title: string;
  message?: string;
  onRetry?: () => void;
  theme: AppTheme;
  retryLabel?: string;
}) {
  return (
    <View style={styles.emptyState}>
      <WarningIcon color={theme.colors.error} size={40} />
      <Text
        accessibilityRole="header"
        style={[
          typography.section,
          { color: theme.colors.onSurface, textAlign: "center", marginTop: spacing.md },
        ]}
      >
        {title}
      </Text>
      {message ? (
        <Text
          style={[
            typography.small,
            {
              color: theme.colors.onSurfaceVariant,
              textAlign: "center",
              marginTop: spacing.sm,
              maxWidth: 340,
            },
          ]}
        >
          {message}
        </Text>
      ) : null}
      {onRetry ? (
        <Button
          title={retryLabel}
          onPress={onRetry}
          theme={theme}
          variant="tonal"
          style={{ marginTop: spacing.lg, minWidth: 160 }}
        />
      ) : null}
    </View>
  );
}

/* ------------------------- Overlays: sheets, dialogs -------------------- */

export type DialogAction = {
  label: string;
  onPress: () => void;
  variant?: "filled" | "tonal" | "outlined" | "text" | "danger";
};

export function Dialog({
  visible,
  title,
  message,
  theme,
  children,
  onClose,
  actions,
}: {
  visible: boolean;
  title: string;
  message?: string;
  theme: AppTheme;
  children?: React.ReactNode;
  onClose?: () => void;
  actions?: DialogAction[];
}) {
  const reduce = useReducedMotion();
  const enter = useSharedValue(0);
  useEffect(() => {
    if (visible) {
      enter.value = 0;
      enter.value = withTiming(1, {
        duration: reduce ? 0 : motion.base,
        easing: Easing.bezier(...motion.easing),
      });
    }
  }, [visible, reduce, enter]);
  const cardStyle = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [{ scale: 0.95 + enter.value * 0.05 }],
  }));
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose ?? (() => {})}
    >
      <View style={[styles.dialogScrim, { backgroundColor: theme.colors.scrim }]}>
        <Animated.View
          accessibilityViewIsModal
          style={[styles.dialogCard, { backgroundColor: theme.colors.surfaceContainer }, cardStyle]}
        >
          <Text
            accessibilityRole="header"
            style={[typography.section, { color: theme.colors.onSurface }]}
          >
            {title}
          </Text>
          {message ? (
            <Text
              style={[
                typography.small,
                { color: theme.colors.onSurfaceVariant, marginTop: spacing.sm },
              ]}
            >
              {message}
            </Text>
          ) : null}
          {children ? <View style={{ marginTop: spacing.md }}>{children}</View> : null}
          {actions && actions.length > 0 ? (
            <View style={styles.dialogActions}>
              {actions.map((a) => (
                <Button
                  key={a.label}
                  title={a.label}
                  onPress={a.onPress}
                  theme={theme}
                  variant={a.variant ?? "text"}
                />
              ))}
            </View>
          ) : null}
        </Animated.View>
      </View>
    </Modal>
  );
}

export function Sheet({
  visible,
  title,
  subtitle,
  onClose,
  theme,
  children,
  footer,
  maxHeight = "85%",
}: {
  visible: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  theme: AppTheme;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxHeight?: `${number}%`;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.sheetScrimWrap}>
        <Pressable
          style={[StyleSheet.absoluteFill, { backgroundColor: theme.colors.scrim }]}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close"
        />
        <View
          accessibilityViewIsModal
          style={[
            styles.sheetCard,
            elevation.sheet,
            {
              backgroundColor: theme.colors.surface,
              paddingBottom: insets.bottom + spacing.md,
              maxHeight,
            },
          ]}
        >
          <View style={[styles.grabber, { backgroundColor: theme.colors.outline }]} />
          <View style={styles.sheetHeader}>
            <View style={{ flex: 1 }}>
              <Text
                accessibilityRole="header"
                style={[typography.title, { color: theme.colors.onSurface }]}
                numberOfLines={2}
              >
                {title}
              </Text>
              {subtitle ? (
                <Text style={[typography.small, { color: theme.colors.onSurfaceVariant }]}>
                  {subtitle}
                </Text>
              ) : null}
            </View>
            <IconButton
              icon={<CloseIcon color={theme.colors.onSurface} size={20} />}
              label="Close"
              theme={theme}
              onPress={onClose}
            />
          </View>
          <ScrollView
            style={{ flexGrow: 0 }}
            contentContainerStyle={{ paddingBottom: spacing.sm }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>
          {footer}
        </View>
      </View>
    </Modal>
  );
}

/* ------------------------------- Layout bits ---------------------------- */

const styles = StyleSheet.create({
  button: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    alignItems: "center",
    justifyContent: "center",
    minHeight: touchTarget,
    overflow: "hidden",
  },
  iconButton: {
    width: touchTarget,
    height: touchTarget,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  card: {
    borderRadius: radius.card,
    padding: spacing.lg,
  },
  fieldWrap: {
    width: "100%",
  },
  textField: {
    flex: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.md,
    ...typography.body,
  },
  textFieldShell: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: radius.control,
    paddingStart: spacing.md,
    paddingEnd: spacing.xs,
  },
  fieldTrailing: {
    alignItems: "center",
    justifyContent: "center",
  },
  searchField: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    height: touchTarget,
  },
  searchInput: {
    flex: 1,
    ...typography.body,
    padding: 0,
    marginStart: spacing.sm,
  },
  searchClear: {
    width: 40,
    height: 40,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 56,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.control,
  },
  toggleText: {
    flex: 1,
    paddingEnd: spacing.md,
  },
  switchTrack: {
    width: 52,
    height: 32,
    borderRadius: radius.pill,
    borderWidth: 1,
    padding: 3,
    justifyContent: "center",
  },
  switchThumb: {
    width: 24,
    height: 24,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 56,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    gap: spacing.md,
    borderRadius: radius.control,
  },
  rowLeading: {
    width: 24,
    alignItems: "center",
  },
  rowText: {
    flex: 1,
  },
  sectionLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 24,
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  sectionAction: {
    minHeight: 32,
    justifyContent: "center",
    paddingHorizontal: spacing.xs,
  },
  section: {
    marginBottom: spacing.sm,
  },
  screen: {
    flex: 1,
  },
  appBar: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  appBarRow: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: touchTarget,
    paddingHorizontal: spacing.xs,
    gap: spacing.xs,
  },
  appBarText: {
    flex: 1,
  },
  segmented: {
    flexDirection: "row",
    borderRadius: radius.pill,
    padding: 4,
    gap: 2,
  },
  segmentInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  segment: {
    flex: 1,
    minHeight: touchTarget - 8,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    minHeight: 36,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    maxWidth: 220,
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    alignSelf: "flex-start",
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: radius.pill,
  },
  progressTrack: {
    height: 6,
    borderRadius: radius.pill,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: radius.pill,
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxl,
  },
  dialogScrim: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xxl,
  },
  dialogCard: {
    width: "100%",
    maxWidth: 380,
    borderRadius: radius.sheet,
    padding: spacing.xl,
  },
  dialogActions: {
    marginTop: spacing.lg,
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  sheetScrimWrap: {
    flex: 1,
    justifyContent: "flex-end",
  },
  sheetCard: {
    borderTopStartRadius: radius.sheet,
    borderTopEndRadius: radius.sheet,
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  grabber: {
    alignSelf: "center",
    width: 32,
    height: 4,
    borderRadius: radius.pill,
    marginBottom: spacing.sm,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
});
