import { TeamMemberCard } from "./TeamMemberCard";
import { BarChart3, Users } from "lucide-react";

const leadsData = [
  { name: "Sabrina Fulas", total: 45, morning: 45, afternoon: 0 },
  { name: "Nayad Souza", total: 41, morning: 41, afternoon: 0 },
  { name: "Caio Zapelini", total: 14, morning: 14, afternoon: 0 },
  { name: "Alana Silveira", total: 16, morning: 16, afternoon: 0 },
];

export const LeadsView = () => {
  const totalLeads = leadsData.reduce((acc, member) => acc + member.total, 0);
  const mediaPorPessoa = (totalLeads / leadsData.length).toFixed(0);

  return (
    <div className="animate-fade-in-up">
      <div className="flex items-center gap-2 mb-6">
        <div className="w-2 h-2 rounded-full bg-gold" />
        <h2 className="text-xl font-semibold text-foreground">Leads Acionados</h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Team Cards */}
        <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
          {leadsData.map((member) => (
            <TeamMemberCard key={member.name} {...member} />
          ))}
        </div>

        {/* Summary Panel */}
        <div className="space-y-4">
          <div className="bg-card rounded-xl p-6 border border-border">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-foreground">Visão Geral</h3>
              <div className="w-10 h-10 rounded-full bg-gold/20 flex items-center justify-center">
                <BarChart3 className="w-5 h-5 text-gold" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-muted rounded-lg p-4 text-center">
                <Users className="w-6 h-6 text-gold mx-auto mb-2" />
                <p className="text-3xl font-bold text-gold">{totalLeads}</p>
                <p className="text-xs text-muted-foreground">Leads acionados</p>
              </div>
              <div className="bg-muted rounded-lg p-4 text-center">
                <BarChart3 className="w-6 h-6 text-pink-500 mx-auto mb-2" />
                <p className="text-3xl font-bold text-pink-500">{mediaPorPessoa}</p>
                <p className="text-xs text-muted-foreground">Média por pessoa</p>
              </div>
            </div>

            <p className="text-xs text-muted-foreground mt-4 text-center">
              *Total de leads acionados pela equipe
            </p>
          </div>

          {/* Top Performer */}
          <div className="bg-gradient-to-br from-gold/20 to-gold/5 rounded-xl p-6 border border-gold/30">
            <p className="text-xs text-gold uppercase tracking-wider mb-2">Top Performer</p>
            <p className="text-lg font-bold text-foreground">{leadsData[0].name}</p>
            <p className="text-3xl font-bold text-gold">{leadsData[0].total} leads</p>
          </div>
        </div>
      </div>
    </div>
  );
};
