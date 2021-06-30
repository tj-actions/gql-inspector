/**
 * Returns a batch of items split by the limit
 */
export function batch<T>(items: T[], limit: number): T[][] {
  const batches: T[][] = []
  const batchesNum = Math.ceil(items.length / limit)

  // We still want to update check-run and send empty annotations
  if (batchesNum === 0) {
    return [[]]
  }

  for (let i = 0; i < batchesNum; i++) {
    const start = i * limit
    const end = start + limit

    batches.push(items.slice(start, end))
  }

  return batches
}

/**
 * Treats non-falsy value as true
 */
export function castToBoolean(
  value: string | boolean,
  defaultValue?: boolean
): boolean {
  if (typeof value === 'boolean') {
    return value
  }

  if (value === 'true' || value === 'false') {
    return value === 'true'
  }

  if (typeof defaultValue === 'boolean') {
    return defaultValue
  }

  return true
}
