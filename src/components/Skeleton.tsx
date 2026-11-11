import React, { useEffect, useRef } from "react";
import { Animated, type StyleProp, type ViewStyle } from "react-native";
import { useReducedMotion } from "../useReducedMotion";

/**
 * Static placeholder for thumbnails that are still downloading.
 *
 * It used to pulse forever (700 ms loop). An infinite animation on a surface
 * that can sit on screen for seconds reads as busy rather than alive, so this
 * is now a single quiet fade-in that settles. Reduced-motion users get the
 * settled wash immediately.
 */
export function Skeleton({
  style,
  color = "rgba(128,128,128,0.22)",
}: {
  style?: StyleProp<ViewStyle>;
  color?: string;
}) {
  const reduce = useReducedMotion();
  const opacity = useRef(new Animated.Value(reduce ? 0.7 : 0.45)).current;

  useEffect(() => {
    if (reduce) {
      opacity.setValue(0.7);
      return;
    }
    const anim = Animated.timing(opacity, {
      toValue: 0.7,
      duration: 180,
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [opacity, reduce]);

  return <Animated.View style={[{ backgroundColor: color, opacity }, style]} />;
}
