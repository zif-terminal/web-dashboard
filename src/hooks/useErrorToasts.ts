import { useEffect, useState } from 'react';
import { subscribeErrors, dismissError, type AppError } from '../lib/errorBus';

// ── React binding for the global error bus (zif #204) ────────────────────────
// Thin subscriber: mirrors the errorBus snapshot into React state so
// <ErrorToastContainer/> re-renders when errors are pushed/dismissed. All the
// dedupe / auto-dismiss / cap logic lives in the bus (framework-agnostic), so
// the Apollo link and mutation .catch handlers can push without React.
export function useErrorToasts(): [AppError[], (id: string) => void] {
  const [errors, setErrors] = useState<AppError[]>([]);

  useEffect(() => subscribeErrors(setErrors), []);

  return [errors, dismissError];
}
