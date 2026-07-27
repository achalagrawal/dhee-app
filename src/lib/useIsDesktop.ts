import { Platform, useWindowDimensions } from "react-native";

/**
 * The prototype's desktop breakpoint. Above it the sidebar sits in the layout
 * next to the content and can collapse to an icon rail; below it the sidebar
 * is the slide-in overlay drawer (`@media (max-width: 820px)` in
 * `Dhee.dc.html`).
 */
export const DESKTOP_MIN_WIDTH = 821;

/**
 * True on a web window wide enough for the persistent sidebar. Native is never
 * "desktop" here: a tablet in landscape is wide enough by pixels but its
 * navigation is the drawer, and the collapse control is hover-first.
 */
export function useIsDesktop(): boolean {
  const { width } = useWindowDimensions();
  return Platform.OS === "web" && width >= DESKTOP_MIN_WIDTH;
}
