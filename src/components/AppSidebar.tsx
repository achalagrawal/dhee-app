import { router } from "expo-router";
import { useEffect, useRef } from "react";
import { Animated, StyleSheet } from "react-native";
import { useShell } from "../lib/shell";
import { useTheme } from "../lib/ThemeContext";
import { SidebarContent } from "./SidebarContent";

/** Widths from the prototype: the full column, and the icon rail it collapses
 *  to. Collapsing narrows the sidebar — it never takes it away. */
const FULL_W = 270;
const RAIL_W = 66;

// The sidebar on a desktop-width window: a permanent column beside the content
// rather than an overlay over it. Mounted only above the breakpoint; narrower
// windows get `AppDrawer` instead.
export function AppSidebar() {
  const { colors } = useTheme();
  const { sidebarCollapsed, collapseSidebar, expandSidebar } = useShell();

  const width = useRef(
    new Animated.Value(sidebarCollapsed ? RAIL_W : FULL_W),
  ).current;

  useEffect(() => {
    Animated.timing(width, {
      toValue: sidebarCollapsed ? RAIL_W : FULL_W,
      duration: 200,
      // Width isn't a transform, so this one has to run on the JS thread.
      useNativeDriver: false,
    }).start();
  }, [sidebarCollapsed, width]);

  const go = (path: string) => router.push(path as never);

  return (
    <Animated.View
      style={[
        styles.aside,
        {
          width,
          backgroundColor: colors.surface,
          borderRightColor: colors.border,
        },
      ]}
    >
      <SidebarContent
        collapsed={sidebarCollapsed}
        onNavigate={go}
        onCollapse={collapseSidebar}
        onExpand={expandSidebar}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  aside: {
    flexShrink: 0,
    borderRightWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
});
