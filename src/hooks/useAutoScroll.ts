import { useEffect, useRef } from "react";

type UseAutoScrollOptions = {
  /** Enable/disable (recommended: only in TV mode). */
  enabled?: boolean;
  /** Pixels per animation frame (~60fps). Default: 1 (≈ 60px/s). */
  speedPxPerFrame?: number;
  /** Pause at the bottom before jumping to top. Default: 2000ms. */
  bottomPauseMs?: number;
  /** Pause at the top after jumping back. Default: 600ms. */
  topPauseMs?: number;
  /** Any value that, when changed, should reset scroll to top (ex.: active tab). */
  resetKey?: any;
};

/**
 * Global auto-scroll helper for TV mode.
 * Scrolls down until the end, pauses, jumps to top, pauses, and repeats.
 */
export function useAutoScroll<T extends HTMLElement>(
  ref: React.RefObject<T>,
  {
    enabled = false,
    speedPxPerFrame = 1,
    bottomPauseMs = 2000,
    topPauseMs = 600,
    resetKey,
  }: UseAutoScrollOptions = {}
) {
  const lastResetKey = useRef<any>(resetKey);

  // Reset to top when resetKey changes (e.g., tab auto-rotate).
  useEffect(() => {
    if (!enabled) return;
    if (lastResetKey.current === resetKey) return;
    lastResetKey.current = resetKey;
    const el = ref.current;
    if (el) el.scrollTop = 0;
  }, [enabled, resetKey, ref]);

  useEffect(() => {
    if (!enabled) return;

    const getEl = () => ref.current;
    const el = getEl();
    if (!el) return;

    let rafId = 0;
    let timeoutId: number | undefined;
    let stopped = false;

    const clearTimers = () => {
      if (rafId) cancelAnimationFrame(rafId);
      if (timeoutId) window.clearTimeout(timeoutId);
    };

    const loop = () => {
      if (stopped) return;
      const node = getEl();
      if (!node) {
        rafId = requestAnimationFrame(loop);
        return;
      }

      const maxScroll = node.scrollHeight - node.clientHeight;
      if (maxScroll <= 0) {
        rafId = requestAnimationFrame(loop);
        return;
      }

      const next = Math.min(node.scrollTop + speedPxPerFrame, maxScroll);
      node.scrollTop = next;

      // Bottom reached → pause → jump to top → pause → continue.
      if (next >= maxScroll - 1) {
        timeoutId = window.setTimeout(() => {
          if (stopped) return;
          const n2 = getEl();
          if (!n2) return;
          n2.scrollTop = 0;
          timeoutId = window.setTimeout(() => {
            if (stopped) return;
            rafId = requestAnimationFrame(loop);
          }, topPauseMs);
        }, bottomPauseMs);
        return;
      }

      rafId = requestAnimationFrame(loop);
    };

    // Start from the top.
    el.scrollTop = 0;
    rafId = requestAnimationFrame(loop);

    return () => {
      stopped = true;
      clearTimers();
    };
  }, [enabled, bottomPauseMs, topPauseMs, speedPxPerFrame, ref, resetKey]);
}
