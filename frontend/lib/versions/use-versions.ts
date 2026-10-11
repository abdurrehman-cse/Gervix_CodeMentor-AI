"use client";
import { useEffect, useRef, useState } from "react";
import type { FileNode } from "../types";
import { createSubmission, freezeSubmission, validateHistory, type ReviewRecord, type Submission } from "./snapshots";
const storageKey = "codementor-versions-v1";
export function useVersions() {
  const [history, setHistory] = useState<Submission[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const snapshot = useRef<Submission[]>([]);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const saved = localStorage.getItem(storageKey);
        const restored = saved ? await validateHistory(JSON.parse(saved)) : [];
        if (mounted) { snapshot.current = restored; setHistory(restored); }
      } catch { if (mounted) setError("Version history could not be restored. The working workspace is unaffected; export your code before clearing storage."); }
      finally { if (mounted) setReady(true); }
    }
    void load();
    return () => { mounted = false; };
  }, []);
  function update(next: Submission[]) {
    localStorage.setItem(storageKey, JSON.stringify(next));
    snapshot.current = next;
    setHistory(next);
  }
  function capture(files: FileNode[], activeFile: string, origin: Submission["origin"] = "review", force = false): Promise<Submission> {
    const copied = files.map(file => ({ ...file }));
    const pending = queue.current.catch(() => {}).then(async () => {
      if (!ready) throw new Error("Version history is still loading.");
      const submission = await createSubmission(snapshot.current, copied, activeFile, origin, force);
      if (!snapshot.current.some(item => item.id === submission.id)) {
        if (snapshot.current.length >= 100) throw new Error("Version history is full. Export your workspace before clearing history.");
        try { update([...snapshot.current, submission]); }
        catch { throw new Error("Version could not be saved. Browser storage is full or unavailable; your working code is safe."); }
      }
      return submission;
    });
    queue.current = pending;
    return pending;
  }
  function record(id: string, review: ReviewRecord) {
    try {
      const next = snapshot.current.map(item => {
        if (item.id !== id) return item;
        const reviews = [...item.reviews.filter(previous => previous.requestId !== review.requestId), review];
        if (reviews.length > 200) throw new Error("This version's review history is full. Resubmit unchanged to create a new version.");
        return freezeSubmission({ ...item, reviews });
      });
      update(next);
    } catch (caught) { setError(caught instanceof Error && caught.message.startsWith("This version") ? caught.message : "Review history could not be saved. Download your code before closing."); }
  }
  return { history, ready, error, capture, record, get: (id: string) => snapshot.current.find(item => item.id === id) };
}
