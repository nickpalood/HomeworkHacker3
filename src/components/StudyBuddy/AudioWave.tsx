import { cn } from "@/lib/utils";

interface AudioWaveProps {
  isActive: boolean;
  className?: string;
}

export function AudioWave({ isActive, className }: AudioWaveProps) {
  return (
    <div className={cn("flex items-center justify-center gap-1", className)}>
      {[0, 1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className={cn(
            "w-1 rounded-full transition-all duration-150",
            "h-2",
            i % 2 === 0 ? "bg-primary" : "bg-secondary"
          )}
          style={{
            height: isActive ? "24px" : "8px",
          }}
        />
      ))}
    </div>
  );
}
