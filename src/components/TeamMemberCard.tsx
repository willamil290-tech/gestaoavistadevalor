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
    <div className="bg-card rounded-lg p-5 border border-border hover:border-secondary/50 transition-all duration-300">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-gold/20 flex items-center justify-center">
            <User className="w-6 h-6 text-gold" />
          </div>
          <span className="font-semibold text-foreground text-lg md:text-xl">{name}</span>
        </div>
        <div className="text-right">
          <span className="text-4xl md:text-5xl font-bold text-secondary">{total}</span>
          <p className="text-sm text-muted-foreground">total</p>
        </div>
      </div>
      
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full bg-secondary" />
          <span className="text-base md:text-lg text-muted-foreground w-20">Manhã</span>
          <div className="flex-1 h-3 bg-muted rounded-full overflow-hidden">
            <div 
              className="h-full bg-secondary rounded-full transition-all duration-500"
              style={{ width: `${(morning / maxValue) * 100}%` }}
            />
          </div>
          <span className="text-lg md:text-xl font-medium text-foreground w-12 text-right">{morning}</span>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full bg-pink-500" />
          <span className="text-base md:text-lg text-muted-foreground w-20">Tarde</span>
          <div className="flex-1 h-3 bg-muted rounded-full overflow-hidden">
            <div 
              className="h-full bg-pink-500 rounded-full transition-all duration-500"
              style={{ width: `${(afternoon / maxValue) * 100}%` }}
            />
          </div>
          <span className="text-lg md:text-xl font-medium text-foreground w-12 text-right">{afternoon}</span>
        </div>
      </div>
    </div>
  );
};
