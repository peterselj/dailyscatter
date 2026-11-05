// Convert between plain JS values and Firestore REST "typed values".

export function encValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: v.length ? { values: v.map(encValue) } : {} };
  if (typeof v === 'object') return { mapValue: { fields: encFields(v) } };
  throw new Error(`Cannot encode ${typeof v}`);
}

export function encFields(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = encValue(v);
  return out;
}

export function decValue(v) {
  if ('nullValue' in v) return null;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('stringValue' in v) return v.stringValue;
  if ('timestampValue' in v) return Date.parse(v.timestampValue);
  if ('arrayValue' in v) return (v.arrayValue.values ?? []).map(decValue);
  if ('mapValue' in v) return decFields(v.mapValue.fields ?? {});
  return null;
}

export function decFields(fields) {
  const out = {};
  for (const [k, v] of Object.entries(fields ?? {})) out[k] = decValue(v);
  return out;
}

// Map keys we write into field paths must be plain identifiers (no quoting needed).
export const SAFE_KEY = /^[a-zA-Z_][a-zA-Z_0-9]*$/;
