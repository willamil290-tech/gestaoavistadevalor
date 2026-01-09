import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DEFAULT_EXTRAS, getDashboardExtras, updateDashboardExtras, type DashboardExtras } from "@/lib/persistence";
import { isSupabaseConfigured } from "@/lib/supabase";

const pollInterval = Number(import.meta.env.VITE_SYNC_POLL_INTERVAL ?? 5000);

export function useDashboardExtras() {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["dashboard-extras"],
    enabled: isSupabaseConfigured,
    queryFn: getDashboardExtras,
    staleTime: 0,
    refetchInterval: pollInterval,
    refetchOnWindowFocus: true,
    placeholderData: DEFAULT_EXTRAS,
  });

  const mutation = useMutation({
    mutationFn: (patch: Partial<DashboardExtras>) => updateDashboardExtras(patch),
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: ["dashboard-extras"] });
      const prev = qc.getQueryData<DashboardExtras>(["dashboard-extras"]);
      if (prev) qc.setQueryData<DashboardExtras>(["dashboard-extras"], { ...prev, ...patch });
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(["dashboard-extras"], ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["dashboard-extras"] });
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
