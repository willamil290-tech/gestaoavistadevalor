import logoImage from "@/assets/logo.jpeg";

export const Logo = ({ className = "w-24 h-24" }: { className?: string }) => {
  return (
    <div className={`${className} flex items-center justify-center`}>
      <img 
        src={logoImage} 
        alt="Devalor Logo" 
        className="w-full h-full object-contain rounded-full"
      />
    </div>
  );
};
