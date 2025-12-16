import { User, Trash2, Check, X } from "lucide-react";
import { useState } from "react";

export interface TeamMember {
  id: string;
  name: string;
  total: number;
  morning: number;
  afternoon: number;
}

interface TeamMemberCardProps {
  member: TeamMember;
  onUpdate: (member: TeamMember) => void;
  onDelete: (id: string) => void;
}

export const TeamMemberCard = ({ member, onUpdate, onDelete }: TeamMemberCardProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(member.name);
  const [editMorning, setEditMorning] = useState(member.morning);
  const [editAfternoon, setEditAfternoon] = useState(member.afternoon);

  const maxValue = Math.max(member.morning, member.afternoon, 1);

  const handleSave = () => {
    onUpdate({
      ...member,
      name: editName,
      morning: editMorning,
      afternoon: editAfternoon,
      total: editMorning + editAfternoon,
    });
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditName(member.name);
    setEditMorning(member.morning);
    setEditAfternoon(member.afternoon);
    setIsEditing(false);
  };

  return (
    <div className="bg-card rounded-lg p-4 md:p-5 border border-border hover:border-secondary/50 transition-all duration-300">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gold/20 flex items-center justify-center">
            <User className="w-5 h-5 text-gold" />
          </div>
          {isEditing ? (
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="font-semibold text-foreground text-lg bg-muted border border-border rounded px-2 py-1 w-40"
            />
          ) : (
            <span 
              className="font-semibold text-foreground text-xl md:text-2xl cursor-pointer hover:text-secondary transition-colors"
              onClick={() => setIsEditing(true)}
            >
              {member.name}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isEditing ? (
            <>
              <button onClick={handleSave} className="p-1 text-green-500 hover:bg-green-500/20 rounded">
                <Check className="w-5 h-5" />
              </button>
              <button onClick={handleCancel} className="p-1 text-red-500 hover:bg-red-500/20 rounded">
                <X className="w-5 h-5" />
              </button>
            </>
          ) : (
            <button onClick={() => onDelete(member.id)} className="p-1 text-muted-foreground hover:text-red-500 hover:bg-red-500/20 rounded transition-colors">
              <Trash2 className="w-4 h-4" />
            </button>
          )}
          <div className="text-right ml-3">
            <span className="text-4xl md:text-5xl font-bold text-secondary">{member.total}</span>
            <p className="text-base text-muted-foreground">total</p>
          </div>
        </div>
      </div>
      
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full bg-secondary" />
          <span className="text-lg text-muted-foreground w-20">Manhã</span>
          <div className="flex-1 h-3 bg-muted rounded-full overflow-hidden">
            <div 
              className="h-full bg-secondary rounded-full transition-all duration-500"
              style={{ width: `${(member.morning / maxValue) * 100}%` }}
            />
          </div>
          {isEditing ? (
            <input
              type="number"
              value={editMorning}
              onChange={(e) => setEditMorning(Number(e.target.value))}
              className="text-xl font-medium text-foreground w-20 text-right bg-muted border border-border rounded px-2 py-1"
            />
          ) : (
            <span 
              className="text-xl font-medium text-foreground w-14 text-right cursor-pointer hover:text-secondary"
              onClick={() => setIsEditing(true)}
            >
              {member.morning}
            </span>
          )}
        </div>
        
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full bg-pink-500" />
          <span className="text-lg text-muted-foreground w-20">Tarde</span>
          <div className="flex-1 h-3 bg-muted rounded-full overflow-hidden">
            <div 
              className="h-full bg-pink-500 rounded-full transition-all duration-500"
              style={{ width: `${(member.afternoon / maxValue) * 100}%` }}
            />
          </div>
          {isEditing ? (
            <input
              type="number"
              value={editAfternoon}
              onChange={(e) => setEditAfternoon(Number(e.target.value))}
              className="text-xl font-medium text-foreground w-20 text-right bg-muted border border-border rounded px-2 py-1"
            />
          ) : (
            <span 
              className="text-xl font-medium text-foreground w-14 text-right cursor-pointer hover:text-secondary"
              onClick={() => setIsEditing(true)}
            >
              {member.afternoon}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};