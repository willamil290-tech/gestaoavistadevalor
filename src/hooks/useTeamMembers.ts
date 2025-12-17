import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addTeamMember,
  deleteTeamMember,
  listTeamMembers,
  upsertTeamMember,
  type TeamCategory,
  type TeamMember,
} from "@/lib/persistence";
import { isSupabaseConfigured } from "@/lib/supabase";

const pollInterval = Number(import.meta.env.VITE_SYNC_POLL_INTERVAL ?? 5000);

export function useTeamMembers(category: TeamCategory) {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["team-members", category],
    enabled: isSupabaseConfigured,
    queryFn: () => listTeamMembers(category),
    staleTime: 0,
    refetchInterval: pollInterval,
    refetchOnWindowFocus: true,
    placeholderData: [],
  });

  const addMutation = useMutation({
    mutationFn: () => addTeamMember(category),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["team-members", category] }),
  });

  const upsertMutation = useMutation({
    mutationFn: (member: TeamMember) => upsertTeamMember(member),
    onMutate: async (member) => {
      await qc.cancelQueries({ queryKey: ["team-members", category] });
      const prev = qc.getQueryData<TeamMember[]>(["team-members", category]);
      if (prev) {
        qc.setQueryData<TeamMember[]>(["team-members", category],
          prev.map((m) => (m.id === member.id ? member : m))
        );
      }
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(["team-members", category], ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["team-members", category] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteTeamMember(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: ["team-members", category] });
      const prev = qc.getQueryData<TeamMember[]>(["team-members", category]);
      if (prev) {
        qc.setQueryData<TeamMember[]>(
          ["team-members", category],
          prev.filter((m) => m.id !== id)
        );
      }
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(["team-members", category], ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["team-members", category] }),
  });

  return {
    ...query,
    addMember: () => addMutation.mutateAsync(),
    addMemberAsync: () => addMutation.mutateAsync(),
    upsertMember: (member: TeamMember) => upsertMutation.mutate(member),
    upsertMemberAsync: (member: TeamMember) => upsertMutation.mutateAsync(member),
    deleteMember: (id: string) => deleteMutation.mutate(id),
    deleteMemberAsync: (id: string) => deleteMutation.mutateAsync(id),
  };
}
