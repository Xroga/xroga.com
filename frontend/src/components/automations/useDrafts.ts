"use client";
import { useEffect, useState } from "react";
import { useWorkspaceIdentity } from "@/components/layout/WorkspaceIdentityContext";

/** Account-separated browser drafts, never represented as server installations. */
export function useDrafts<T>(
  name: string,
  initial: T,
  validate: (value: unknown) => value is T,
) {
  const identity = useWorkspaceIdentity();
  const key = `xroga-automation-v1:${identity.userId || "guest"}:${name}`;
  const [state, setState] = useState<{ key: string; value: T }>({
    key: "",
    value: initial,
  });
  const [error, setError] = useState("");
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      const value: unknown = raw ? JSON.parse(raw) : initial;
      setState({ key, value: validate(value) ? value : initial });
    } catch (cause) {
      setState({ key, value: initial });
      setError(
        `Local drafts could not be read. ${cause instanceof Error ? cause.message : "Browser storage may be unavailable."}`,
      );
    }
    // Initial/validator are schema constants; only account/key changes reload drafts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const value = state.key === key ? state.value : initial;
  function save(next: T) {
    try {
      localStorage.setItem(key, JSON.stringify(next));
      setState({ key, value: next });
      setError("");
      return true;
    } catch {
      setError("Draft was not saved: browser storage is unavailable or full.");
      return false;
    }
  }
  return { value, save, error, ready: state.key === key };
}
