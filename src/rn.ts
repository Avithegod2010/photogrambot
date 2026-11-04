// Central react-native re-export. `Text` is swapped for the font-scale-aware
// wrapper so the Appearance → Font scale preference reaches every screen.
// All UI files import from here instead of "react-native".
export * from "react-native";
export { Text } from "./components/ScaledText";
