/**
 * `next/navigation` stand-in for the render harness.
 *
 * The render specs mount pages outside a Next app-router tree, so the real
 * hooks throw "expected app router to be mounted". Each spec installs the
 * values below on `globalThis` before mounting; the shim reads them at call
 * time so a test can change the router or route params between mounts.
 */
type RouterLike = {
  push: (href: string) => void;
  replace: (href: string) => void;
};

const globals = globalThis as Record<string, unknown>;

export function useRouter(): RouterLike {
  return (globals.__nextRouter as RouterLike | undefined) ?? { push: () => undefined, replace: () => undefined };
}

export function useParams<T extends Record<string, string | string[]>>(): T {
  return (globals.__nextParams as T | undefined) ?? ({} as T);
}

export function useSearchParams(): URLSearchParams {
  return new URLSearchParams((globals.__nextSearch as string | undefined) ?? '');
}

export function usePathname(): string {
  return (globals.__nextPathname as string | undefined) ?? '/';
}

export function redirect(href: string): never {
  throw new Error(`redirect(${href}) is not available in the render harness`);
}

export function notFound(): never {
  throw new Error('notFound() is not available in the render harness');
}
