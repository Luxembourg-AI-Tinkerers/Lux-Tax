'use client';

import type { ReactElement } from 'react';
import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { HELP_TEXTS, type HelpId } from '../lib/help-texts';
import { TOOLTIP_WIDTH, VIEWPORT_MARGIN, placeTooltip, type TooltipPlacement } from '../lib/tooltip-position';

/**
 * The "?" that sits next to an option whose name does not explain itself.
 *
 * Behaviour follows what people already expect from modern products: hovering or
 * focusing shows the explanation, clicking pins it (so it also works on a
 * touchscreen), Escape or a click outside closes it. The bubble is rendered in a
 * portal rather than inside the label, because half the options that need it sit
 * in scrollable tables and would otherwise be clipped.
 */


export interface HelpTipProps {
  id: HelpId;
  /** `right` anchors the bubble to the trigger's right edge, for tight table cells. */
  align?: 'auto' | 'right';
  className?: string;
}

export function HelpTip({ id, align = 'auto', className = '' }: HelpTipProps) {
  const entry = HELP_TEXTS[id];
  const [pinned, setPinned] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [placement, setPlacement] = useState<TooltipPlacement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const bubbleId = useId();

  const open = pinned || hovered;

  const close = useCallback(() => {
    setPinned(false);
    setHovered(false);
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      setPlacement(null);
      return;
    }

    const trigger = triggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const next = placeTooltip(
      { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
      viewport,
    );

    setPlacement(align === 'right' ? { ...next, left: Math.max(VIEWPORT_MARGIN, rect.right - TOOLTIP_WIDTH) } : next);
  }, [open, align]);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target && triggerRef.current?.contains(target)) return;
      if (target && (target as Element).closest?.('[data-help-bubble]')) return;
      close();
    };
    // A fixed bubble would drift away from its trigger on scroll or resize.
    const onViewportChange = () => close();

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('scroll', onViewportChange, true);
    window.addEventListener('resize', onViewportChange);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('scroll', onViewportChange, true);
      window.removeEventListener('resize', onViewportChange);
    };
  }, [open, close]);

  const bubble: ReactElement | null =
    open && placement && typeof document !== 'undefined'
      ? createPortal(
          <span
            data-help-bubble=""
            role="tooltip"
            id={bubbleId}
            style={{
              position: 'fixed',
              top: placement.top,
              left: placement.left,
              width: TOOLTIP_WIDTH,
              transform: placement.above ? 'translateY(-100%)' : undefined,
            }}
            className="z-[70] block rounded-lg bg-slate-900 px-3 py-2 text-left text-[11px] leading-relaxed text-slate-100 shadow-xl ring-1 ring-black/10"
          >
            <span className="block text-[11px] font-bold text-white">{entry.title}</span>
            <span className="mt-0.5 block font-normal text-slate-300">{entry.body}</span>
          </span>,
          document.body,
        )
      : null;

  return (
    <span className={`inline-flex align-middle ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={`About: ${entry.title}`}
        aria-describedby={open ? bubbleId : undefined}
        aria-expanded={open}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setPinned((value) => !value);
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onFocus={() => setHovered(true)}
        onBlur={() => setHovered(false)}
        className="inline-flex h-4 w-4 shrink-0 cursor-help items-center justify-center rounded-full border border-slate-300 bg-white text-[10px] font-bold leading-none text-slate-500 transition hover:border-sky-400 hover:text-sky-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-1"
      >
        ?
      </button>
      {/* The repo resolves two copies of the React types (19 in apps/web, 18 in
          .tools), so a portal's type is not the one this JSX expects. It is a
          valid child at runtime; the cast is the cost of the dual install. */}
      {bubble as any}
    </span>
  );
}
