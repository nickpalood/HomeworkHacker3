import { Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface MuteToggleProps {
  isMuted: boolean;
  onToggle: () => void;
}

export function MuteToggle({ isMuted, onToggle }: MuteToggleProps) {
  const Icon = isMuted ? VolumeX : Volume2;
  const title = isMuted ? "Unmute" : "Mute";

  return (
    <Button 
      variant="ghost" 
      size="icon" 
      onClick={onToggle} 
      title={title} 
      className={cn(
        "text-foreground hover:bg-secondary hover:text-white hover:glow-secondary transition-all",
        isMuted && "bg-red-500 text-white hover:bg-red-600"
      )}
    >
      <Icon className="h-5 w-5" />
    </Button>
  );
}
