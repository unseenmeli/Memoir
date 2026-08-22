import { useCallback, useEffect, useRef } from "react";
import { Dimensions } from "react-native";
import { Gesture } from "react-native-gesture-handler";
import {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { haptics } from "@/lib/haptics";

// How far (px) or how fast (px/s) a downward drag has to go before it counts
// as "let go of the sheet" instead of a bounce back to the top.
const DISMISS_DISTANCE = 120;
const DISMISS_VELOCITY = 900;

// Comfortably past the bottom of any screen, so the sweep-away animation
// finishes with the card fully off-screen instead of stopping mid-frame —
// a fixed guess that's shorter than the device's actual height would leave a
// sliver of the card visible right up until it's abruptly unmounted, which
// reads as a glitch rather than a dismissal.
const SWEEP_DISTANCE = Dimensions.get("window").height + 200;

// The sweep is timed to carry on at roughly the speed the finger left the
// card moving (`distance / speed`, linear), so releasing mid-flick doesn't
// visibly restart the card from a standstill. The floor covers a slow drag
// past the distance threshold — there's barely any velocity to inherit there,
// so it just needs to leave briskly — and the clamp keeps a hard flick from
// teleporting off in a single frame.
const MIN_SWEEP_SPEED = 2200;
const MIN_SWEEP_MS = 130;
const MAX_SWEEP_MS = 280;

/**
 * How long the *container* takes to remove itself once `onDismiss` has run:
 * a RN `Modal`'s own slide-out, or expo-router's transparent-modal
 * transition. The sheet stays parked off-screen for this long afterwards
 * instead of snapping straight back to the top — restoring it any earlier
 * makes it flick back up into view underneath that closing animation, which
 * is the half-pop that read as a bug at the end of a drag-down.
 */
const CONTAINER_EXIT_MS = 450;

/**
 * Vertical drag-to-dismiss for a sheet's grabber/header zone. Native iOS
 * `pageSheet` modals get this for free, but plain RN `Modal`s (and Android in
 * general, where `presentationStyle` has no effect at all) don't — this
 * reproduces the same feel by hand: drag the handle down, the whole sheet
 * follows your finger, and it either snaps closed or springs back.
 *
 * Only meant to be attached (via `GestureDetector`) to the non-scrolling
 * grabber/header area, not the sheet's scrollable body — otherwise it fights
 * the body's own scroll gesture.
 *
 * Sheets that stay mounted between presentations (`Modal visible={...}`)
 * should call the returned `reset` when they open, *not* when they close —
 * see `CONTAINER_EXIT_MS`.
 */
export function useDragToDismiss(onDismiss: () => void, enabled = true) {
  const translateY = useSharedValue(0);
  const restoreTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearRestore = useCallback(() => {
    if (restoreTimer.current) {
      clearTimeout(restoreTimer.current);
      restoreTimer.current = null;
    }
  }, []);

  useEffect(() => clearRestore, [clearRestore]);

  /** Put the sheet back at the top, ready to be presented again. */
  const reset = useCallback(() => {
    clearRestore();
    translateY.value = 0;
  }, [clearRestore, translateY]);

  const finishDismiss = useCallback(() => {
    // Fires as the card leaves rather than the moment the finger lifts, so
    // the tick lands on the sheet actually being gone.
    haptics.dismiss();
    onDismiss();
    // Leave the card parked off-screen while the container animates itself
    // away, then quietly restore it once nothing is on screen to see it move.
    clearRestore();
    restoreTimer.current = setTimeout(() => {
      restoreTimer.current = null;
      translateY.value = 0;
    }, CONTAINER_EXIT_MS);
  }, [clearRestore, onDismiss, translateY]);

  const gesture = Gesture.Pan()
    .enabled(enabled)
    .onUpdate((e) => {
      if (e.translationY > 0) translateY.value = e.translationY;
    })
    .onEnd((e) => {
      const shouldDismiss =
        e.translationY > DISMISS_DISTANCE || e.velocityY > DISMISS_VELOCITY;
      if (shouldDismiss) {
        const speed = Math.max(e.velocityY, MIN_SWEEP_SPEED);
        const duration = Math.min(
          MAX_SWEEP_MS,
          Math.max(
            MIN_SWEEP_MS,
            ((SWEEP_DISTANCE - translateY.value) / speed) * 1000,
          ),
        );
        translateY.value = withTiming(
          SWEEP_DISTANCE,
          { duration, easing: Easing.linear },
          (finished) => {
            if (finished) runOnJS(finishDismiss)();
          },
        );
      } else {
        translateY.value = withSpring(0, { damping: 20, stiffness: 250 });
      }
    });

  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  return { gesture, style, reset };
}
