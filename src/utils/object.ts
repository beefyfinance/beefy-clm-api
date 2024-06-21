/**
 * Object.keys but keeps the type of the keys
 * @param object
 */
export function keys<K extends string>(
  object: Record<K, unknown> | Partial<Record<K, unknown>>
): K[] {
  return Object.keys(object) as K[];
}

/**
 * Object.entries but keeps the type of the keys
 * @param object
 */
export function entries<K extends string, V>(
  object: Record<K, V> | Partial<Record<K, V>>
): [K, V][] {
  return Object.entries(object) as [K, V][];
}
