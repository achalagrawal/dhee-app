import { type ComponentRef, forwardRef, useEffect, useId, useRef } from "react";
import { Animated, Easing } from "react-native";
import Svg, {
  Circle,
  type CircleProps,
  G,
  type GProps,
  Line,
  Mask,
} from "react-native-svg";

// The Dhee mark: forty rays around an open centre. The numbers below are
// measured off the source artwork (a 440x440 animated PNG), which is why they
// are not round — including the ~6deg the whole burst sits off the vertical.
// Drawing it as vectors instead of shipping the PNG keeps it sharp at 16px,
// lets it take whichever accent the reader has chosen, and — the reason it is
// here — makes the animation something we can start and stop.

const FIRST_ANGLE = 6.25;
const CENTRE = 220;
const VIEW_BOX = "0 0 440 440";

// Endpoints of the stroke itself; the round caps carry it out to r=97.6..204.2.
const R_IN = 102.6;
const R_OUT = 199.2;
const RAY_LEN = R_OUT - R_IN;

// One turn of the sweep. 60 frames at ~33fps in the source.
const CYCLE_MS = 1940;

// Below this the forty rays land on less than half a pixel each and the mark
// greys out into a smudge, so it drops to every other ray, drawn heavier. It
// is the same mark, set for the size — the ring and the gap do not move.
const SMALL_BELOW = 24;

// Where the source starts its sweep: the ray at 267deg, just shy of twelve
// o'clock. A property of the artwork, so it does not move with the ray count.
const SWEEP_ORIGIN = FIRST_ANGLE + 29 * (360 / 40);

const WIPE_R = (R_IN + R_OUT) / 2;
const WIPE_LEN = 2 * Math.PI * WIPE_R;

// Rays are drawn outward-end first so that dashing them off the front retracts
// the outer tip and leaves the inner one where it is — the motion in the
// original — and leaves both ends round while it does.
function cut(rays: number, stroke: number) {
  const step = 360 / rays;
  return {
    stroke,
    // Wide enough to cover a ray cap to cap, so the sweep reveals whole rays.
    wipeWidth: RAY_LEN + stroke + 6,
    // Half a step back, so the sweep starts in the gap ahead of that ray.
    wipeFrom: SWEEP_ORIGIN - step / 2,
    lines: Array.from({ length: rays }, (_, i) => {
      const a = ((FIRST_ANGLE + i * step) * Math.PI) / 180;
      const cos = Math.cos(a);
      const sin = Math.sin(a);
      return {
        x1: CENTRE + R_OUT * cos,
        y1: CENTRE + R_OUT * sin,
        x2: CENTRE + R_IN * cos,
        y2: CENTRE + R_IN * sin,
      };
    }),
  };
}

const FULL = cut(40, 10.05);
const SMALL = cut(20, 15);

// Animated adds `collapsable={false}` to whatever it wraps — an Android hint
// that the view must not be flattened away, since the native driver needs
// something to point at. react-native-svg's web shapes forward props they don't
// recognise straight to the DOM, so on web it lands on <circle>/<g> as an
// unknown boolean attribute and React logs an error for each one, which Expo
// then puts on screen as a dev overlay. Drop it here, where the meaning is
// clear: these are SVG nodes, not Views, so there is no flattening either way.
type Collapsable = { collapsable?: boolean };

const SvgCircle = forwardRef<
  ComponentRef<typeof Circle>,
  CircleProps & Collapsable
>(({ collapsable, ...props }, ref) => <Circle ref={ref} {...props} />);
const SvgG = forwardRef<ComponentRef<typeof G>, GProps & Collapsable>(
  ({ collapsable, ...props }, ref) => <G ref={ref} {...props} />,
);

const AnimatedG = Animated.createAnimatedComponent(SvgG);
const AnimatedCircle = Animated.createAnimatedComponent(SvgCircle);

export function DheeMark({
  size = 32,
  color = "#000",
  /** Run the sweep. Left off, the mark rests with every ray at full length. */
  animated = false,
}: {
  size?: number;
  color?: string;
  animated?: boolean;
}) {
  const phase = useRef(new Animated.Value(0)).current;
  // Two marks can be on screen at once (the header and a replying avatar) and
  // on web these ids land in one document, so the mask has to be per-instance.
  // The colons useId hands back are not safe inside url(#...).
  const maskId = `dhee-wipe-${useId().replace(/:/g, "")}`;

  useEffect(() => {
    if (!animated) return;
    const loop = Animated.loop(
      Animated.timing(phase, {
        toValue: 1,
        duration: CYCLE_MS,
        easing: Easing.linear,
        // Native driver only carries transform and opacity; these are SVG
        // geometry props, so this one runs on the JS thread.
        useNativeDriver: false,
      }),
    );
    loop.start();
    return () => {
      loop.stop();
      phase.setValue(0);
    };
  }, [animated, phase]);

  const set = size < SMALL_BELOW ? SMALL : FULL;
  const rays = set.lines.map((r, i) => <Line key={i} {...r} />);
  const ink = {
    stroke: color,
    strokeWidth: set.stroke,
    strokeLinecap: "round",
    fill: "none",
  } as const;

  if (!animated) {
    return (
      <Svg width={size} height={size} viewBox={VIEW_BOX}>
        <G {...ink}>{rays}</G>
      </Svg>
    );
  }

  return (
    <Svg width={size} height={size} viewBox={VIEW_BOX}>
      <Mask id={maskId}>
        <AnimatedCircle
          cx={CENTRE}
          cy={CENTRE}
          r={WIPE_R}
          fill="none"
          stroke="#fff"
          strokeWidth={set.wipeWidth}
          strokeDasharray={[WIPE_LEN, WIPE_LEN]}
          strokeDashoffset={phase.interpolate({
            inputRange: [0, 1],
            outputRange: [WIPE_LEN, 0],
          })}
          transform={`rotate(${set.wipeFrom} ${CENTRE} ${CENTRE})`}
        />
      </Mask>
      <G {...ink}>
        {/* Every ray, drawing steadily inward over the turn... */}
        <AnimatedG
          strokeDasharray={[RAY_LEN, RAY_LEN]}
          strokeDashoffset={phase.interpolate({
            inputRange: [0, 1],
            outputRange: [0, -RAY_LEN],
          })}
        >
          {rays}
        </AnimatedG>
        {/* ...and the sweep coming round behind it, putting them back. */}
        <G mask={`url(#${maskId})`}>{rays}</G>
      </G>
    </Svg>
  );
}
