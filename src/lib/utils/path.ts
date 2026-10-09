/*
  Read and write nested values by dot path, e.g. "company.yearFounded" or "people.2".
  setAt never mutates: it copies each object/array along the path, which is what
  React state needs to notice the change.
*/

type Container = Record<string, unknown> | unknown[];

export function getAt(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((cur, key) => (cur == null ? undefined : (cur as Record<string, unknown>)[key]), obj);
}

export function setAt<T>(obj: T, path: string, value: unknown): T {
  const [key, ...rest] = path.split(".");
  const current = obj as unknown as Container;
  const copy: Container = Array.isArray(current) ? [...current] : { ...current };
  const next = rest.length ? setAt((copy as Record<string, unknown>)[key], rest.join("."), value) : value;
  (copy as Record<string, unknown>)[key] = next;
  return copy as unknown as T;
}
