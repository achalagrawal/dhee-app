import Svg, { Circle, Path, Rect } from "react-native-svg";

// The prototype draws its own thin-stroke icon set inline. This mirrors the
// ones used across the in-scope screens, each keeping the prototype's original
// viewBox and path data so the strokes stay faithful. `stroke`/`fill` are
// driven by `color` (default currentColor is not available in RN SVG).

export type IconName =
  | "menu"
  | "close"
  | "plus"
  | "search"
  | "history"
  | "send"
  | "mic"
  | "voice"
  | "copy"
  | "edit"
  | "share"
  | "thumbUp"
  | "thumbDown"
  | "bookmark"
  | "speaker"
  | "refresh"
  | "chevronDown"
  | "chevronRight"
  | "chevronLeft"
  | "chevronUp"
  | "incognito"
  | "download"
  | "dots"
  | "stop"
  | "check"
  | "sparkle"
  | "book"
  | "globe"
  | "file"
  | "image"
  | "trash"
  | "logo"
  | "scrollDown"
  | "collapse";

type Props = {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
  /** For the bookmark: draw filled when saved. */
  filled?: boolean;
};

export function Icon({
  name,
  size = 18,
  color = "#000",
  strokeWidth = 1.5,
  filled = false,
}: Props) {
  const s = { stroke: color, strokeWidth, fill: "none" } as const;
  const round = { strokeLinecap: "round", strokeLinejoin: "round" } as const;

  switch (name) {
    case "menu":
      return (
        <Svg width={size} height={size} viewBox="0 0 20 20">
          <Path
            d="M3 6H17 M3 10H13 M3 14H15"
            {...s}
            strokeWidth={1.7}
            strokeLinecap="round"
          />
        </Svg>
      );
    case "close":
      return (
        <Svg width={size} height={size} viewBox="0 0 15 15">
          <Path
            d="M3.5 3.5L11.5 11.5 M11.5 3.5L3.5 11.5"
            {...s}
            strokeWidth={1.6}
            strokeLinecap="round"
          />
        </Svg>
      );
    case "plus":
      return (
        <Svg width={size} height={size} viewBox="0 0 18 18">
          <Path
            d="M9 4V14 M4 9H14"
            {...s}
            strokeWidth={1.7}
            strokeLinecap="round"
          />
        </Svg>
      );
    case "search":
      return (
        <Svg width={size} height={size} viewBox="0 0 15 15">
          <Circle cx={6.5} cy={6.5} r={4.5} {...s} strokeWidth={1.4} />
          <Path
            d="M10 10L13 13"
            {...s}
            strokeWidth={1.4}
            strokeLinecap="round"
          />
        </Svg>
      );
    case "history":
      return (
        <Svg width={size} height={size} viewBox="0 0 18 18">
          <Path d="M9 4.5V9L12 10.5" {...s} {...round} />
          <Path
            d="M3.2 7.2C3.9 4.5 6.2 2.5 9 2.5C12.6 2.5 15.5 5.4 15.5 9C15.5 12.6 12.6 15.5 9 15.5C6.6 15.5 4.5 14.2 3.4 12.3"
            {...s}
            strokeLinecap="round"
          />
          <Path d="M2.5 4.5V7.2H5.2" {...s} {...round} />
        </Svg>
      );
    case "send":
      return (
        <Svg width={size} height={size} viewBox="0 0 17 17">
          <Path
            d="M8.5 14V3.5 M4 8L8.5 3.5L13 8"
            {...s}
            strokeWidth={1.7}
            {...round}
          />
        </Svg>
      );
    case "mic":
      return (
        <Svg width={size} height={size} viewBox="0 0 17 17">
          <Rect x={6} y={2} width={5} height={8.5} rx={2.5} {...s} />
          <Path
            d="M3.5 8C3.5 10.8 5.7 12.5 8.5 12.5C11.3 12.5 13.5 10.8 13.5 8 M8.5 12.5V15 M6 15H11"
            {...s}
            strokeLinecap="round"
          />
        </Svg>
      );
    case "voice":
      return (
        <Svg width={size} height={size} viewBox="0 0 18 18">
          <Path
            d="M4 7V11 M7 4.5V13.5 M10 6.5V11.5 M13 8V10"
            {...s}
            strokeWidth={1.6}
            strokeLinecap="round"
          />
        </Svg>
      );
    case "copy":
      return (
        <Svg width={size} height={size} viewBox="0 0 14 14">
          <Rect
            x={3.5}
            y={3.5}
            width={7.5}
            height={8.5}
            rx={1.5}
            {...s}
            strokeWidth={1.3}
          />
          <Path
            d="M2.5 9V2.5C2.5 1.9 3 1.5 3.5 1.5H8.5"
            {...s}
            strokeWidth={1.3}
          />
        </Svg>
      );
    case "edit":
      return (
        <Svg width={size} height={size} viewBox="0 0 15 15">
          <Path
            d="M9.5 2.8L12.2 5.5 M3 11.5L9.8 4.7C10.3 4.2 11 4.2 11.5 4.7L12.3 5.5C12.8 6 12.8 6.7 12.3 7.2L5.5 14H3Z"
            {...s}
            strokeWidth={1.3}
            strokeLinejoin="round"
          />
        </Svg>
      );
    case "share":
      return (
        <Svg width={size} height={size} viewBox="0 0 16 16">
          <Path
            d="M8 10.5V2.5 M5 5.5L8 2.5L11 5.5 M3.5 8.5V13H12.5V8.5"
            {...s}
            strokeWidth={1.3}
            {...round}
          />
        </Svg>
      );
    case "thumbUp":
      return (
        <Svg width={size} height={size} viewBox="0 0 16 16">
          <Path
            d="M5 7L8 2.5C8.9 2.5 9.5 3.2 9.5 4V6.5H13C13.6 6.5 14 7 13.9 7.6L13 12.4C12.9 13 12.4 13.5 11.8 13.5H5Z M5 7V13.5 M2.5 7.5H5V13.5H2.5Z"
            {...s}
            strokeWidth={1.3}
            strokeLinejoin="round"
          />
        </Svg>
      );
    case "thumbDown":
      return (
        <Svg width={size} height={size} viewBox="0 0 16 16">
          <Path
            d="M11 9L8 13.5C7.1 13.5 6.5 12.8 6.5 12V9.5H3C2.4 9.5 2 9 2.1 8.4L3 3.6C3.1 3 3.6 2.5 4.2 2.5H11Z M11 9V2.5 M13.5 8.5H11V2.5H13.5Z"
            {...s}
            strokeWidth={1.3}
            strokeLinejoin="round"
          />
        </Svg>
      );
    case "bookmark":
      return (
        <Svg width={size} height={size} viewBox="0 0 16 16">
          <Path
            d="M4 2.5H12V13.5L8 10.5L4 13.5Z"
            stroke={color}
            strokeWidth={1.3}
            strokeLinejoin="round"
            fill={filled ? color : "none"}
          />
        </Svg>
      );
    case "speaker":
      return (
        <Svg width={size} height={size} viewBox="0 0 16 16">
          <Path
            d="M3 6H5L8.5 3V13L5 10H3Z"
            {...s}
            strokeWidth={1.3}
            strokeLinejoin="round"
          />
          <Path
            d="M11 6C11.8 6.8 11.8 9.2 11 10 M13 4.5C14.5 6 14.5 10 13 11.5"
            {...s}
            strokeWidth={1.3}
            strokeLinecap="round"
          />
        </Svg>
      );
    case "refresh":
      return (
        <Svg width={size} height={size} viewBox="0 0 15 15">
          <Path
            d="M12.5 6.5C12 4.2 10 2.5 7.5 2.5C5.4 2.5 3.6 3.8 2.9 5.6 M2.5 3V5.6H5.1 M2.5 8.5C3 10.8 5 12.5 7.5 12.5C9.6 12.5 11.4 11.2 12.1 9.4 M12.5 12V9.4H9.9"
            {...s}
            strokeWidth={1.3}
            {...round}
          />
        </Svg>
      );
    case "chevronDown":
      return (
        <Svg width={size} height={size} viewBox="0 0 12 12">
          <Path d="M3 4.5L6 7.5L9 4.5" {...s} strokeWidth={1.4} {...round} />
        </Svg>
      );
    case "chevronUp":
      return (
        <Svg width={size} height={size} viewBox="0 0 12 12">
          <Path d="M3 7.5L6 4.5L9 7.5" {...s} strokeWidth={1.4} {...round} />
        </Svg>
      );
    case "chevronRight":
      return (
        <Svg width={size} height={size} viewBox="0 0 14 14">
          <Path d="M5 3L9 7L5 11" {...s} strokeWidth={1.5} {...round} />
        </Svg>
      );
    case "chevronLeft":
      return (
        <Svg width={size} height={size} viewBox="0 0 16 16">
          <Path d="M10 3L5 8L10 13" {...s} strokeWidth={1.6} {...round} />
        </Svg>
      );
    case "incognito":
      return (
        <Svg width={size} height={size} viewBox="0 0 22 22">
          <Path
            d="M4 18V8C4 4.7 7.1 2.5 11 2.5C14.9 2.5 18 4.7 18 8V18L15.7 16.3L13.4 18L11 16.3L8.6 18L6.3 16.3Z"
            {...s}
            strokeLinejoin="round"
          />
          <Circle cx={8.5} cy={9.5} r={1.15} fill={color} />
          <Circle cx={13.5} cy={9.5} r={1.15} fill={color} />
        </Svg>
      );
    case "download":
      return (
        <Svg width={size} height={size} viewBox="0 0 16 16">
          <Path
            d="M8 2V10 M4.5 6.5L8 10L11.5 6.5 M3 13H13"
            {...s}
            strokeWidth={1.4}
            {...round}
          />
        </Svg>
      );
    case "dots":
      return (
        <Svg width={size} height={size} viewBox="0 0 16 16">
          <Circle cx={8} cy={3} r={1.3} fill={color} />
          <Circle cx={8} cy={8} r={1.3} fill={color} />
          <Circle cx={8} cy={13} r={1.3} fill={color} />
        </Svg>
      );
    case "stop":
      return (
        <Svg width={size} height={size} viewBox="0 0 14 14">
          <Rect x={3} y={3} width={8} height={8} rx={1.5} fill={color} />
        </Svg>
      );
    case "check":
      return (
        <Svg width={size} height={size} viewBox="0 0 16 16">
          <Path d="M3 8.5L6.5 12L13 4.5" {...s} strokeWidth={1.6} {...round} />
        </Svg>
      );
    case "sparkle":
      return (
        <Svg width={size} height={size} viewBox="0 0 14 14">
          <Path
            d="M7 1.5L8.7 5L12.5 5.5L9.7 8.1L10.5 12L7 10.1L3.5 12L4.3 8.1L1.5 5.5L5.3 5Z"
            {...s}
            strokeWidth={1.2}
            strokeLinejoin="round"
          />
        </Svg>
      );
    case "book":
      return (
        <Svg width={size} height={size} viewBox="0 0 18 18">
          <Path
            d="M3 4C3 3.2 3.6 2.5 4.5 2.5H14V13H4.5C3.6 13 3 13.6 3 14.5Z"
            {...s}
            strokeLinejoin="round"
          />
          <Path
            d="M3 14.5C3 15.3 3.6 15.5 4.5 15.5H14"
            {...s}
            strokeLinecap="round"
          />
        </Svg>
      );
    case "globe":
      return (
        <Svg width={size} height={size} viewBox="0 0 14 14">
          <Circle cx={7} cy={7} r={5.5} {...s} strokeWidth={1.2} />
          <Path
            d="M1.5 7H12.5 M7 1.5C8.7 3 8.7 11 7 12.5 M7 1.5C5.3 3 5.3 11 7 12.5"
            {...s}
            strokeWidth={1.1}
          />
        </Svg>
      );
    case "file":
      return (
        <Svg width={size} height={size} viewBox="0 0 15 15">
          <Path
            d="M4 2H9L12 5V13H4Z"
            {...s}
            strokeWidth={1.2}
            strokeLinejoin="round"
          />
          <Path d="M9 2V5H12" {...s} strokeWidth={1.2} strokeLinejoin="round" />
        </Svg>
      );
    case "image":
      return (
        <Svg width={size} height={size} viewBox="0 0 16 16">
          <Rect
            x={2.5}
            y={3}
            width={11}
            height={10}
            rx={2}
            {...s}
            strokeWidth={1.3}
          />
          <Circle cx={6} cy={6.5} r={1.1} {...s} strokeWidth={1.1} />
          <Path
            d="M3 11.5L6.5 8.5L9 10.5L11 9L13.5 11.5"
            {...s}
            strokeWidth={1.3}
            {...round}
          />
        </Svg>
      );
    case "trash":
      return (
        <Svg width={size} height={size} viewBox="0 0 16 16">
          <Path
            d="M3.5 4.5H12.5 M6 4.5V3.2C6 2.8 6.3 2.5 6.7 2.5H9.3C9.7 2.5 10 2.8 10 3.2V4.5 M4.5 4.5L5 12.5C5 13 5.4 13.5 6 13.5H10C10.6 13.5 11 13 11 12.5L11.5 4.5"
            {...s}
            strokeWidth={1.3}
            {...round}
          />
        </Svg>
      );
    case "scrollDown":
      return (
        <Svg width={size} height={size} viewBox="0 0 17 17">
          <Path
            d="M8.5 3V13 M4 8.5L8.5 13L13 8.5"
            {...s}
            strokeWidth={1.6}
            {...round}
          />
        </Svg>
      );
    case "collapse":
      return (
        <Svg width={size} height={size} viewBox="0 0 19 19">
          <Rect
            x={2.5}
            y={3.5}
            width={14}
            height={12}
            rx={2.5}
            {...s}
            strokeWidth={1.4}
          />
          <Path d="M7.5 3.5V15.5" {...s} strokeWidth={1.4} />
        </Svg>
      );
    case "logo":
      return (
        <Svg width={size} height={size} viewBox="0 0 32 32">
          <Circle
            cx={16}
            cy={16}
            r={12}
            stroke={color}
            strokeWidth={2}
            fill="none"
          />
          <Circle cx={16} cy={16} r={4} fill={color} />
        </Svg>
      );
    default:
      return null;
  }
}
