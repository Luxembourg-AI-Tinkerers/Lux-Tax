/**
 * Geometry for the help bubble.
 *
 * Kept apart from the component so it can be tested without a DOM: the two
 * things that break a tooltip are an edge it runs off and a flip that does not
 * happen near the bottom of the screen.
 */

export const TOOLTIP_WIDTH = 288;
export const VIEWPORT_MARGIN = 8;

export interface TooltipPlacement {
  top: number;
  left: number;
  /** True when the bubble sits above the trigger and must be shifted up by its own height. */
  above: boolean;
}

/**
 * Places the bubble under the trigger, flips it above when there is no room, and
 * clamps it horizontally so a "?" near the right edge stays readable.
 */
export function placeTooltip(
  trigger: { top: number; left: number; width: number; height: number },
  viewport: { width: number; height: number },
  bubbleWidth = TOOLTIP_WIDTH,
  bubbleHeight = 96,
): TooltipPlacement {
  const centre = trigger.left + trigger.width / 2;
  const maxLeft = viewport.width - bubbleWidth - VIEWPORT_MARGIN;
  const left = Math.max(VIEWPORT_MARGIN, Math.min(centre - bubbleWidth / 2, maxLeft));

  const below = trigger.top + trigger.height + 8;
  const above = trigger.top - bubbleHeight - 8;
  const fitsBelow = below + bubbleHeight <= viewport.height - VIEWPORT_MARGIN;

  return { top: fitsBelow ? below : Math.max(VIEWPORT_MARGIN, above), left, above: !fitsBelow };
}
