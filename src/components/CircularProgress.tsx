import { cn } from "@/lib/utils";

interface CircularProgressProps {
  percentage: number;
  label: string;
  variant?: "primary" | "secondary";
  size?: number;
}

export const CircularProgress = ({
  percentage,
  label,
  variant = "primary",
  size = 180,
}: CircularProgressProps) => {
  const strokeWidth = 16;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.min(percentage, 100) / 100) * circumference;

  const colors = {
    primary: {
      stroke: "stroke-primary",
      text: "text-primary",
      bg: "stroke-muted",
    },
    secondary: {
      stroke: "stroke-secondary",
      text: "text-secondary",
      bg: "stroke-muted",
    },
  };

  return (
    <div className="flex flex-col items-center gap-3">
      <span className="text-base md:text-lg lg:text-xl font-semibold text-muted-foreground uppercase tracking-wider">
        {label}
      </span>
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          className="transform -rotate-90"
          width={size}
          height={size}
        >
          {/* Background circle */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth={strokeWidth}
            className={cn(colors[variant].bg, "opacity-30")}
          />
          {/* Progress circle */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            className={cn(colors[variant].stroke, "transition-all duration-700 ease-out")}
            style={{
              strokeDasharray: circumference,
              strokeDashoffset: offset,
            }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-4xl md:text-5xl lg:text-6xl font-bold text-white">
            {percentage.toFixed(1)}%
          </span>
        </div>
      </div>
    </div>
  );
};
