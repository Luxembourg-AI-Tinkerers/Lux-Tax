/**
 * Data-class policy for model routes.
 *
 * Every model declares the most sensitive data class it may receive
 * (`permittedDataClass`) and every route declares the class of the data it
 * processes (`maxDataClass`). Before this module both fields were decorative:
 * a model registered as `PUBLIC` or `SYNTHETIC` could be wired into a
 * `CUSTOMER_DOCUMENT` route and would then receive full salary certificates.
 *
 * The policy is a pure function so it can be unit-tested and so the same rules
 * apply wherever a route is written or validated.
 */
export type ModelDataClass =
  | 'PUBLIC'
  | 'SYNTHETIC'
  | 'REDACTED_CUSTOMER'
  | 'CUSTOMER_DOCUMENT';

const DATA_CLASS_RANK: Readonly<Record<ModelDataClass, number>> = {
  PUBLIC: 0,
  SYNTHETIC: 1,
  REDACTED_CUSTOMER: 2,
  CUSTOMER_DOCUMENT: 3,
};

export const MODEL_DATA_CLASSES: readonly ModelDataClass[] = [
  'PUBLIC',
  'SYNTHETIC',
  'REDACTED_CUSTOMER',
  'CUSTOMER_DOCUMENT',
];

export function asModelDataClass(value: string | null | undefined): ModelDataClass | null {
  if (typeof value !== 'string') return null;
  return (MODEL_DATA_CLASSES as readonly string[]).includes(value)
    ? (value as ModelDataClass)
    : null;
}

/** `true` when the class is about a real customer (redacted or raw). */
export function isCustomerDataClass(value: string | null | undefined): boolean {
  const parsed = asModelDataClass(value);
  return parsed !== null && DATA_CLASS_RANK[parsed] >= DATA_CLASS_RANK.REDACTED_CUSTOMER;
}

/**
 * `true` when a model declaring `permitted` may process data classified as
 * `required`. An unknown class on either side permits nothing (fail closed).
 */
export function permitsDataClass(
  permitted: string | null | undefined,
  required: string | null | undefined,
): boolean {
  const permittedClass = asModelDataClass(permitted);
  const requiredClass = asModelDataClass(required);
  if (!permittedClass || !requiredClass) return false;
  return DATA_CLASS_RANK[permittedClass] >= DATA_CLASS_RANK[requiredClass];
}

export type RouteModelRole = 'primary' | 'fallback';

export interface RouteDataClass {
  readonly taskName: string;
  readonly maxDataClass: string;
}

export interface RouteModelRef {
  readonly modelId: string;
  readonly permittedDataClass: string;
  readonly role: RouteModelRole;
}

function describe(model: RouteModelRef, route: RouteDataClass, permitted: ModelDataClass): string {
  const target = `${model.role === 'primary' ? 'Primary model' : 'Fallback model'} ${model.modelId}`;
  if (permitted === 'PUBLIC' || permitted === 'SYNTHETIC') {
    return (
      `${target} is restricted to ${permitted} data and may never be selected for the ` +
      `${route.maxDataClass} task "${route.taskName}".`
    );
  }
  return (
    `${target} permits only ${permitted} data, which does not cover the ` +
    `${route.maxDataClass} classification of task "${route.taskName}".`
  );
}

/**
 * Returns a human-readable violation when `model` may not be assigned to
 * `route`, or `null` when the assignment is acceptable.
 *
 * - The primary model must permit the route's full data class — a route whose
 *   primary cannot handle its own data has no compliant execution path.
 * - A fallback may be narrower than the route, because the shipped registry
 *   pairs document routes with a `REDACTED_CUSTOMER` fallback, but a `PUBLIC`
 *   or `SYNTHETIC` model is never allowed to receive customer data at all.
 */
export function routeDataClassViolation(
  route: RouteDataClass,
  model: RouteModelRef,
): string | null {
  const routeClass = asModelDataClass(route.maxDataClass);
  if (!routeClass) {
    return `Route "${route.taskName}" declares an unknown data class "${route.maxDataClass}".`;
  }
  const permitted = asModelDataClass(model.permittedDataClass);
  if (!permitted) {
    return (
      `${model.modelId} declares an unknown data class "${model.permittedDataClass}"; ` +
      `it cannot be assigned to task "${route.taskName}".`
    );
  }

  if (model.role === 'primary') {
    return permitsDataClass(permitted, routeClass) ? null : describe(model, route, permitted);
  }

  if (isCustomerDataClass(routeClass) && (permitted === 'PUBLIC' || permitted === 'SYNTHETIC')) {
    return describe(model, route, permitted);
  }
  return null;
}

/** All violations for a full route assignment (primary plus fallbacks). */
export function routeAssignmentViolations(
  route: RouteDataClass,
  primary: RouteModelRef,
  fallbacks: readonly RouteModelRef[],
): readonly string[] {
  const violations: string[] = [];
  const primaryViolation = routeDataClassViolation(route, primary);
  if (primaryViolation) violations.push(primaryViolation);
  for (const fallback of fallbacks) {
    const violation = routeDataClassViolation(route, fallback);
    if (violation) violations.push(violation);
  }
  return violations;
}
