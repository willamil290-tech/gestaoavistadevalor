import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DEFAULT_SETTINGS,
  getDashboardSettings,
  updateDashboardSettings,
  type DashboardSettings,
} from "@/lib/persistence";
import { isSupabaseConfigured } from "@/lib/supabase";

const pollInterval = Number(import.meta.env.VITE_SYNC_POLL_INTERVAL ?? 5000);

export function useDashboardSettings() {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["dashboard-settings"],
    enabled: isSupabaseConfigured,
    queryFn: getDashboardSettings,
    staleTime: 0,
    refetchInterval: pollInterval,
    refetchOnWindowFocus: true,
    placeholderData: DEFAULT_SETTINGS,
  });

  const mutation = useMutation({
    mutationFn: (patch: Partial<DashboardSettings>) => updateDashboardSettings(patch),
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: ["dashboard-settings"] });
      const prev = qc.getQueryData<DashboardSettings>(["dashboard-settings"]);
      if (prev) {
        qc.setQueryData<DashboardSettings>(["dashboard-settings"], { ...prev, ...patch });
      }
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(["dashboard-settings"], ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["dashboard-settings"] });
    },
  });

  return {
    ...query,
    update: mutation.mutate,
    updateAsync: mutation.mutateAsync,
    updating: mutation.isPending,
    updateError: mutation.error,
  };
}
