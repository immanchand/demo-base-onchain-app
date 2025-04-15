// src/lib/csrfStore.ts
const csrfTokens = new Map<string, string>();

export function getCsrfTokens(): Map<string, string> {
  return csrfTokens;
}
