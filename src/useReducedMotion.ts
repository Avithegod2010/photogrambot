import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

/**
 * Tracks the system "Remove animations" / reduced-motion setting.
 *
 * Motion is never removed entirely: opacity and colour changes still explain
 * state changes. Only movement (scale, slide, spring) is skipped.
 */
export function useReducedMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => {
        if (alive) setReduce(v);
      })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", (v) => {
      if (alive) setReduce(v);
    });
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  return reduce;
}
