import { useWindowDimensions } from "react-native";

/**
 * Wide-layout probe for tablets, foldables and DeX external displays.
 * 720 dp is the usual Android "tablet" breakpoint; landscape phones stay on
 * the single-pane layout unless they cross it.
 */
export function useResponsive() {
  const { width, height } = useWindowDimensions();
  return {
    width,
    height,
    isLandscape: width > height,
    isWide: width >= 720,
  };
}
