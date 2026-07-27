"use client";

import { useEffect, useState } from "react";

/**
 * Trails `value` by `delay` ms. Keeps keystroke-driven queries off every
 * keypress while the input itself stays instant.
 */
export function useDebouncedValue<T>(value: T, delay = 250): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
