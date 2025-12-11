export const Logo = ({ className = "w-24 h-24" }: { className?: string }) => {
  return (
    <div className={`${className} flex items-center justify-center`}>
      <svg viewBox="0 0 100 100" className="w-full h-full">
        {/* Outer circle */}
        <circle
          cx="50"
          cy="50"
          r="45"
          fill="none"
          stroke="currentColor"
          strokeWidth="4"
          className="text-foreground"
        />
        {/* Inner circle */}
        <circle
          cx="50"
          cy="50"
          r="38"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="text-foreground"
        />
        {/* Handshake icon */}
        <g transform="translate(25, 32)" className="text-foreground" fill="currentColor">
          {/* Left hand */}
          <path d="M0 18 C0 12, 5 8, 10 10 L15 12 L20 8 C22 6, 26 6, 28 8 L35 14" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="3" 
                strokeLinecap="round"/>
          {/* Right hand */}
          <path d="M50 18 C50 12, 45 8, 40 10 L35 12 L30 8 C28 6, 24 6, 22 8" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="3" 
                strokeLinecap="round"/>
          {/* Clasped hands center */}
          <path d="M20 14 Q25 20, 30 14" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="3" 
                strokeLinecap="round"/>
          {/* Sleeve details */}
          <path d="M0 18 L8 24 L8 30" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="3" 
                strokeLinecap="round"/>
          <path d="M50 18 L42 24 L42 30" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="3" 
                strokeLinecap="round"/>
        </g>
      </svg>
    </div>
  );
};
