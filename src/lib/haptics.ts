import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

/**
 * The app's haptic vocabulary.
 *
 * Everything goes through here rather than calling `expo-haptics` inline, so
 * the same kind of moment always feels the same everywhere in the app — the
 * thing that separates haptics that read as feedback from haptics that read
 * as a phone buzzing at you.
 *
 * The mapping follows what iOS itself does (and what the App Store's better
 * apps copy):
 *
 *  - a *choice* changing gets the lightest possible tick (`selection`)
 *  - a *press that commits to something* gets a light impact (`tap`)
 *  - a *gesture latching on* gets a firmer one, because the finger is already
 *    pressing and needs to feel it through the hold (`longPress`)
 *  - something *leaving the screen* gets a soft thud (`dismiss`)
 *  - an *outcome* gets the system notification patterns, which people already
 *    read as "done" / "careful" / "that failed" without looking
 *
 * Deliberately NOT wired up: scrolling, zoom buttons, plain navigation,
 * cancel buttons, and anything that can fire repeatedly under one finger.
 * Haptics are punctuation — used on everything they stop meaning anything,
 * and on Android they're loud enough to be actively unpleasant.
 */

// Web's `navigator.vibrate` is a single dumb buzz with no notion of a light
// tick, and desktop browsers ignore it entirely — nothing here would land the
// way it's meant to, so the whole vocabulary is a no-op off-device.
const SUPPORTED = Platform.OS === "ios" || Platform.OS === "android";

/**
 * Haptics are an accent on something that already happened visually, so a
 * failure to play one must never surface: iOS rejects these outright in Low
 * Power Mode, while the camera is live, or when the user has turned the
 * Taptic Engine off, and none of that is worth an unhandled rejection.
 */
function fire(play: () => Promise<void>) {
  if (!SUPPORTED) return;
  play().catch(() => {});
}

export const haptics = {
  /** A discrete choice changed: tab, filter, tag chip, theme segment. */
  selection() {
    fire(() => Haptics.selectionAsync());
  },

  /** A press that commits to something: primary buttons, pull-to-refresh. */
  tap() {
    fire(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
  },

  /** A gesture latched on under the finger — a long-press being recognized. */
  longPress() {
    fire(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
  },

  /** A surface finished leaving: a sheet swiped away, done animating. */
  dismiss() {
    fire(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft));
  },

  /** The thing the user asked for went through: saved, deleted, signed in. */
  success() {
    fire(() =>
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
    );
  },

  /** Refused before it started: a missing field, a limit already reached. */
  warning() {
    fire(() =>
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning),
    );
  },

  /** It was attempted and failed: upload died, wrong code, name taken. */
  error() {
    fire(() =>
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error),
    );
  },
};
