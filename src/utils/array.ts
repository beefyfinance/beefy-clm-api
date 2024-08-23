/** Pass to Array.filter to remove null/undefined and narrow type */
export function isDefined<T>(value: T): value is Exclude<T, undefined | null> {
  return value !== undefined && value !== null;
}
