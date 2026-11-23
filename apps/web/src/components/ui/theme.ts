/**
 * Shared 2026 visual tokens for cards, form fields, and buttons across all routes.
 * Importing from here prevents button-color and input-background drift across views.
 */
export const UI_CARD =
  'rounded-2xl border border-zinc-200/85 bg-white shadow-[0_1px_2px_rgba(9,9,11,0.03)] dark:border-zinc-800/90 dark:bg-[#161920] dark:shadow-none';

export const UI_SUBPANEL =
  'rounded-xl border border-zinc-200/80 bg-zinc-50/70 dark:border-zinc-800/80 dark:bg-[#12151b]';

export const UI_INPUT =
  'w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-base font-medium text-zinc-950 placeholder:text-zinc-400 transition focus:border-zinc-950 focus:outline-none focus:ring-2 focus:ring-zinc-950/10 sm:py-2 sm:text-sm dark:border-zinc-700/80 dark:bg-[#12151b] dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-sky-400 dark:focus:ring-sky-400/20';

export const UI_INPUT_COMPACT =
  'rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-950 placeholder:text-zinc-400 transition focus:border-zinc-950 focus:outline-none focus:ring-2 focus:ring-zinc-950/10 sm:py-1.5 sm:text-xs dark:border-zinc-700/80 dark:bg-[#12151b] dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-sky-400 dark:focus:ring-sky-400/20';

export const UI_BTN_PRIMARY =
  'inline-flex items-center justify-center gap-1.5 rounded-xl bg-zinc-950 px-4 py-2.5 text-xs font-bold text-white shadow-xs transition hover:bg-zinc-800 active:scale-[0.98] disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-white';

export const UI_BTN_SECONDARY =
  'inline-flex items-center justify-center gap-1.5 rounded-xl border border-zinc-200/90 bg-white px-4 py-2.5 text-xs font-semibold text-zinc-800 shadow-2xs transition hover:border-zinc-300 hover:bg-zinc-50 active:scale-[0.98] disabled:opacity-50 dark:border-zinc-700/80 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:border-zinc-600 dark:hover:bg-zinc-800';

export const UI_BTN_DANGER =
  'inline-flex items-center justify-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2.5 text-xs font-bold text-white shadow-xs transition hover:bg-rose-700 active:scale-[0.98] disabled:opacity-50 dark:bg-rose-500 dark:hover:bg-rose-400 dark:text-zinc-950';
