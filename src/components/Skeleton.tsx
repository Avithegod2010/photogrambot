import React, { useEffect, useRef } from "react";
import { Animated, type StyleProp, type ViewStyle } from "react-native";

/**
 * Pulsing placeholder for thumbnails that are still downloading. Used by
 * TelegramImage when Appearance → Loading skeletons is on.
 */
export function Skeleton({
  style,
  color = "rgba(128,128,128,0.22)",
}: {
  style?: StyleProp<ViewStyle>;
  color?: string;
}) {
  const opacity = useRef(new Animated.Value(0.45)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.9, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.35, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return <Animated.View style={[{ backgroundColor: color, opacity }, style]} />;
}
