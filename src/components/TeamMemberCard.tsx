import { User } from "lucide-react";

interface TeamMemberCardProps {
  name: string;
  total: number;
  morning: number;
  afternoon: number;
}

export const TeamMemberCard = ({ name, total, morning, afternoon }: TeamMemberCardProps) => {
  const maxValue = Math.max(morning, afternoon, 1);

  return (
    <div className="bg-card rounded-lg p-4 border border-border hover:border-secondary/50 transition-all duration-300">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gold/20 flex items-center justify-center">
            <User className="w-5 h-5 text-gold" />
          </div>
          <span className="font-semibold text-foreground">{name}</span>
        </div>
        <div className="text-right">
          <span className="text-2xl font-bold text-secondary">{total}</span>
          <p className="text-xs text-muted-foreground">total</p>
        </div>
      </div>
      
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-secondary" />
          <span className="text-sm text-muted-foreground w-16">Manhã</span>
          <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
            <div 
              className="h-full bg-secondary rounded-full transition-all duration-500"
              style={{ width: `${(morning / maxValue) * 100}%` }}
            />
          </div>
          <span className="text-sm font-medium text-foreground w-8 text-right">{morning}</span>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-pink-500" />
          <span className="text-sm text-muted-foreground w-16">Tarde</span>
          <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
            <div 
              className="h-full bg-pink-500 rounded-full transition-all duration-500"
              style={{ width: `${(afternoon / maxValue) * 100}%` }}
            />
          </div>
          <span className="text-sm font-medium text-foreground w-8 text-right">{afternoon}</span>
        </div>
      </div>
    </div>
  );
};
