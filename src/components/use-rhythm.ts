"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import type { RhythmData } from "./task-composer";
export function useRhythm(month: string) {
  const [data, setData] = useState<RhythmData | null>(null),
    [error, setError] = useState("");
  const sequence = useRef(0);
  const load = useCallback(async () => {
    const seq = ++sequence.current;
    try {
      const r = await fetch(`/api/rhythm?month=${encodeURIComponent(month)}`, {
        cache: "no-store"
      });
      const j = await r.json();
      if (!r.ok) throw Error(j.error || "המידע אינו זמין");
      if (seq === sequence.current) {
        setData(j);
        setError("");
      }
    } catch (e) {
      if (seq === sequence.current) setError(e instanceof Error ? e.message : "שגיאה בטעינה");
    }
  }, [month]);
  useEffect(() => {
    void load();
    const refresh = () => void load();
    window.addEventListener("samgad:saved", refresh);
    return () => {
      sequence.current++;
      window.removeEventListener("samgad:saved", refresh);
    };
  }, [load]);
  return {
    data,
    error,
    setError,
    load
  };
}
export const currentMonth = () => new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Jerusalem",
  year: "numeric",
  month: "2-digit"
}).format(new Date());
export function useTaskMutations(reload: () => Promise<void>) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [undo, setUndo] = useState<string[]>([]),
    [notice, setNotice] = useState("");
  const requests = useRef(new Map<string, string>());
  async function request(url: string, method: string, body: Record<string, unknown>) {
    const key = url + JSON.stringify(body);
    if (method === "POST" && !requests.current.has(key)) requests.current.set(key, crypto.randomUUID());
    const r = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(method === "POST" && !url.endsWith("/undo") ? {
        ...body,
        clientRequestId: requests.current.get(key)
      } : body)
    });
    const j = await r.json();
    if (!r.ok) throw Error(j.error || "השינוי לא נשמר");
    requests.current.delete(key);
    const token = j.undoToken || j.item?.undoToken || j.occurrence?.undoToken || j.task?.undoToken;
    return {
      value: j,
      token: token as string | undefined
    };
  }
  async function run(operations: {
    url: string;
    method: string;
    body: Record<string, unknown>;
  }[]) {
    setBusy(true);
    setError("");
    setNotice("");
    const tokens: string[] = [];
    let saved = 0;
    try {
      for (const op of operations) {
        const result = await request(op.url, op.method, op.body);
        if (result.token) tokens.push(result.token);
        saved++;
      }
      setNotice(operations.length > 1 ? `${saved} פעולות נשמרו` : "השינוי נשמר");
      return true;
    } catch (e) {
      setError(`${e instanceof Error ? e.message : "השינוי לא נשמר"}${saved ? ` · ${saved} פעולות נשמרו לפני השגיאה` : ""}`);
      return false;
    } finally {
      setUndo(tokens);
      await reload();
      window.dispatchEvent(new Event("samgad:saved"));
      setBusy(false);
    }
  }
  async function cancel() {
    setBusy(true);
    setError("");
    let restored = 0;
    try {
      for (const token of [...undo].reverse()) {
        await request("/api/rhythm/undo", "POST", {
          token
        });
        restored++;
      }
      setUndo([]);
      setNotice("הפעולה בוטלה");
    } catch (e) {
      setUndo(undo.slice(0, undo.length - restored));
      setError(e instanceof Error ? e.message : "לא ניתן לבטל");
    } finally {
      await reload();
      window.dispatchEvent(new Event("samgad:saved"));
      setBusy(false);
    }
  }
  useEffect(() => {
    if (!undo.length) return;
    const timer = setTimeout(() => setUndo([]), 55_000);
    return () => clearTimeout(timer);
  }, [undo]);
  return {
    busy,
    error,
    notice,
    undo,
    run,
    cancel
  };
}
