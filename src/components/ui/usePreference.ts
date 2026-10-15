import { useCallback, useState, type SetStateAction } from "react";

// Only presentation preferences belong here. Never store sessions or catalogue rows.
export function usePreference<T>(
  key: string,
  fallback: T,
  valid: (value: unknown) => value is T,
) {
  const read = useCallback(() => {
    try {
      const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? "null");
      return valid(parsed) ? parsed : fallback;
    } catch {
      return fallback;
    }
  }, [key, fallback, valid]);
  const [state, setState] = useState(() => ({ key, value: read() }));
  const value = state.key === key ? state.value : read();
  const setValue = (next: SetStateAction<T>) => {
    setState((previous) => {
      const current = previous.key === key ? previous.value : read();
      const updated =
        typeof next === "function" ? (next as (value: T) => T)(current) : next;
      try {
        localStorage.setItem(key, JSON.stringify(updated));
      } catch {
        /* Works without storage. */
      }
      return { key, value: updated };
    });
  };
  return [value, setValue] as const;
}
