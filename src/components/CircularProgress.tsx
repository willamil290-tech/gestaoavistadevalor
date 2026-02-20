import { useRef } from "react";
import { cn } from "@/lib/utils";

interface CircularProgressProps {
  percentage: number;
  label: string;
  variant?: "primary" | "secondary";
  size?: number;
}

// Unique ID counter for SVG gradient defs
let gradientIdCounter = 0;

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

  const gradientIdRef = useRef(`cp-grad-${++gradientIdCounter}`);
  const gradientId = gradientIdRef.current;

  const isOver200 = percentage >= 200;
  const isOver300 = percentage >= 300;

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

  // For the animated gradient (>200%), we use CSS animation on the SVG gradient stops
  // For >300%, we use a rainbow/colorful animation

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
          <defs>
            {isOver300 ? (
              <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" className="anim-rainbow-stop1" />
                <stop offset="25%" className="anim-rainbow-stop2" />
                <stop offset="50%" className="anim-rainbow-stop3" />
                <stop offset="75%" className="anim-rainbow-stop4" />
                <stop offset="100%" className="anim-rainbow-stop5" />
              </linearGradient>
            ) : isOver200 ? (
              <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" className={variant === "primary" ? "anim-pulse-stop1-primary" : "anim-pulse-stop1-secondary"} />
                <stop offset="100%" className={variant === "primary" ? "anim-pulse-stop2-primary" : "anim-pulse-stop2-secondary"} />
              </linearGradient>
            ) : null}
          </defs>

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
            strokeWidth={strokeWidth + (isOver200 ? 2 : 0)}
            strokeLinecap="round"
            className={cn(
              !isOver200 && colors[variant].stroke,
              "transition-all duration-700 ease-out",
            )}
            style={{
              strokeDasharray: circumference,
              strokeDashoffset: offset,
              ...(isOver200 ? { stroke: `url(#${gradientId})` } : {}),
            }}
          />

          {/* Glow filter for >200% */}
          {isOver200 && (
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              strokeWidth={strokeWidth + 6}
              strokeLinecap="round"
              className="opacity-20"
              style={{
                strokeDasharray: circumference,
                strokeDashoffset: offset,
                stroke: `url(#${gradientId})`,
                filter: "blur(6px)",
              }}
            />
          )}
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={cn(
            "text-3xl md:text-4xl font-bold",
            isOver300 ? "anim-rainbow-text" : isOver200 ? "anim-pulse-text" : "text-white",
          )}>
            {percentage.toFixed(1)}%
          </span>
        </div>
      </div>
    </div>
  );
};
