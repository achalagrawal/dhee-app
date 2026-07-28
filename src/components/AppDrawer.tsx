import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { USE_NATIVE_DRIVER } from "../lib/motion";
import { useShell } from "../lib/shell";
import { useTheme } from "../lib/ThemeContext";
import { SidebarContent } from "./SidebarContent";

const MAX_W = 330;

// The sidebar in its overlay form, for phones and narrow windows. Renders once
// at the layout level; open/close state lives in the shell context so any
// header can trigger it. Above the desktop breakpoint the same content is a
// permanent column instead — see `AppSidebar`.
export function AppDrawer() {
  const { colors } = useTheme();
  const { drawerOpen, closeDrawer } = useShell();
  const insets = useSafeAreaInsets();

  const width = Math.min(Dimensions.get("window").width * 0.86, MAX_W);
  const translate = useRef(new Animated.Value(-width)).current;
  const scrim = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (drawerOpen) {
      setMounted(true);
      Animated.parallel([
        Animated.timing(translate, {
          toValue: 0,
          duration: 240,
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
        Animated.timing(scrim, {
          toValue: 1,
          duration: 240,
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
      ]).start();
    } else if (mounted) {
      Animated.parallel([
        Animated.timing(translate, {
          toValue: -width,
          duration: 220,
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
        Animated.timing(scrim, {
          toValue: 0,
          duration: 220,
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
      ]).start(({ finished }) => {
        if (finished) setMounted(false);
      });
    }
  }, [drawerOpen, mounted, translate, scrim, width]);

  if (!mounted) return null;

  const go = (path: string) => {
    closeDrawer();
    router.push(path as never);
  };

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View
        style={[StyleSheet.absoluteFill, styles.scrim, { opacity: scrim }]}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={closeDrawer} />
      </Animated.View>

      <Animated.View
        style={[
          styles.panel,
          {
            width,
            backgroundColor: colors.surface,
            borderRightColor: colors.border,
            transform: [{ translateX: translate }],
          },
        ]}
      >
        <SidebarContent
          collapsed={false}
          onNavigate={go}
          onClose={closeDrawer}
          paddingTop={insets.top}
          paddingBottom={insets.bottom}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: { backgroundColor: "rgba(0,0,0,0.4)", zIndex: 60 },
  panel: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    borderRightWidth: StyleSheet.hairlineWidth,
    zIndex: 61,
  },
});
