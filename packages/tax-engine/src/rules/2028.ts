import type { RulePackage } from './types';
import { RULES_2026 } from './2026';

/**
 * Tax year 2028 — single tax class ("classe U").
 *
 * Projet de loi 8676 was voted in October 2026 to replace classes 1 / 1a / 2 by a
 * single scale from 1 January 2028, with a long transition for couples already
 * taxed collectively.
 *
 * This package exists so the engine can *model* 2028 as a data change rather
 * than a rewrite. It must not be used for 2025–2026 returns, and the transition
 * rules (25-year phase-out for existing Class 2 couples) are not yet implemented:
 * `singleClass` is therefore exposed as a flag, and the engine still accepts the
 * legacy class values while applying one tariff.
 *
 * The tariff itself is held identical to 2025/2026 until the 2028 law publishes
 * its own scale — deliberately conservative, not an assumption about the reform.
 */
export const RULES_2028: RulePackage = {
  ...RULES_2026,
  taxYear: 2028,
  version: '2028.0.0-preview',
  sourceRef:
    'Projet de loi 8676 (classe unique, vote octobre 2026) — PREVIEW ONLY: 2028 scale and transition rules not yet published',
  singleClass: true,
  // 25-year transition announced for couples already in collective assessment.
  // The blend formula is not published, so method stays 'NONE'.
  classUTransition: { years: 25, method: 'NONE' },
};
