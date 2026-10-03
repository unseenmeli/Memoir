import { invalidatePins } from "./data";
import { EXAMPLES } from "./examples";
import { INITIAL_REGION } from "./mapRegion";
import { supabase } from "./supabase";

/**
 * Sample pins dropped into a brand-new guest session.
 *
 * Two reasons this exists. App Review needs to see a working app rather than
 * an empty map — "we were unable to locate any features" is a standard 2.1
 * rejection, and with private pins a fresh account has nothing in it. And for
 * a real person tapping "Look around first", an empty map teaches nothing
 * about what the app is for.
 *
 * Named and tagged so they can never be mistaken for the user's own memories.
 *
 * Only the pin rows are written. Their photos come from the app bundle at read
 * time (see `examplePhotos` in examples.ts), so a guest session never uploads
 * anything or adds a `pin_photos` row.
 */
export async function seedExamplePins(userId: string): Promise<void> {
  const now = Date.now();

  const { error } = await supabase.from("pins").insert(
    EXAMPLES.map((example, index) => ({
      owner_id: userId,
      name: example.name,
      description: example.description,
      tags: example.tags,
      latitude: INITIAL_REGION.latitude + example.offset.lat,
      longitude: INITIAL_REGION.longitude + example.offset.lng,
      // Staggered so "Recent" gives them a stable, sensible order.
      created_at: new Date(now - index * 1000).toISOString(),
    })),
  );
  if (error) throw new Error(error.message);

  invalidatePins();
}
