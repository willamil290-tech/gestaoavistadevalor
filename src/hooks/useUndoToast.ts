import { useRef } from "react";
import { toast } from "sonner";

/**
 * Shows a toast with a "Desfazer" action for a limited time.
 * Designed for bulk updates and reset actions.
 */
export function useUndoToast() {
  const tokenRef = useRef<{ cancelled: boolean } | null>(null);

  return function showUndo(opts: {
    message: string;
    onUndo: () => Promise<void> | void;
    ttlMs?: number;
    undoLabel?: string;
  }) {
    const ttl = opts.ttlMs ?? 30_000;

    if (tokenRef.current) tokenRef.current.cancelled = true;
    const token = { cancelled: false };
    tokenRef.current = token;

    const id = toast(opts.message, {
      duration: ttl,
      action: {
        label: opts.undoLabel ?? "Desfazer",
        onClick: async () => {
          if (token.cancelled) return;
          token.cancelled = true;
          await opts.onUndo();
          toast.success("Desfeito ✅");
        },
      },
    });

    setTimeout(() => {
      token.cancelled = true;
      toast.dismiss(id);
    }, ttl);
  };
}
