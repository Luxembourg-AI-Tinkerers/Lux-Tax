/**
 * Double-tax relief method by treaty partner.
 *
 * Luxembourg does not apply one uniform method:
 *  - with France, the convention works largely by **exemption with progression**
 *    (the foreign income is not taxed, but it raises the rate applied to the
 *    Luxembourg income);
 *  - with Germany, Belgium and most other partners, the **ordinary credit**
 *    method applies (foreign income is included, foreign tax is credited up to
 *    the Luxembourg tax attributable to that income);
 *  - with no treaty at all, Art. 134bis LIR grants an ordinary credit.
 *
 * The table below is a *default* used to seed the engine. It is deliberately
 * conservative and must be confirmed per country and per income type against
 * the ACD convention collection before a return is filed.
 */

export type TreatyMethod = 'EXEMPTION_PROGRESSION' | 'CREDIT';

export const TREATY_METHODS: Readonly<Record<string, TreatyMethod>> = {
  FR: 'EXEMPTION_PROGRESSION',
  BE: 'CREDIT',
  DE: 'CREDIT',
  NL: 'CREDIT',
  LU: 'CREDIT',
  PT: 'CREDIT',
  IT: 'CREDIT',
  ES: 'CREDIT',
  AT: 'CREDIT',
  CH: 'CREDIT',
  UK: 'CREDIT',
  GB: 'CREDIT',
  US: 'CREDIT',
  CA: 'CREDIT',
  PL: 'CREDIT',
  RO: 'CREDIT',
  SE: 'CREDIT',
  DK: 'CREDIT',
  FI: 'CREDIT',
  IE: 'CREDIT',
};

/** No treaty -> Art. 134bis ordinary credit. */
export function treatyMethodFor(country: string | undefined): TreatyMethod {
  if (!country) return 'CREDIT';
  return TREATY_METHODS[country.toUpperCase()] ?? 'CREDIT';
}
