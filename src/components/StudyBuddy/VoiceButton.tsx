import { Mic, MicOff, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface VoiceButtonProps {
  isListening: boolean;
  isProcessing: boolean;
  disabled?: boolean;
  onClick: () => void;
}

export function VoiceButton({ isListening, isProcessing, disabled, onClick }: VoiceButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || isProcessing}
      className={cn(
        "relative flex h-16 w-16 items-center justify-center rounded-full transition-all duration-300",
        "focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/50",
        isListening
          ? "bg-primary text-white scale-110 glow-primary"
          : "bg-card text-foreground hover:bg-primary hover:text-white hover:scale-105 hover:glow-primary shadow-lg",
        disabled && "opacity-50 cursor-not-allowed"
      )}
      aria-label={isListening ? "Stop listening" : "Start listening"}
    >
      {isProcessing ? (
        <Loader2 className="h-6 w-6 animate-spin" />
      ) : isListening ? (
        <MicOff className="h-6 w-6" />
      ) : (
        <Mic className="h-6 w-6" />
      )}
      
      {/* Pulse animation is now handled by CSS variables */}
      {isListening && <span className="absolute inset-0 rounded-full pulse-ring" />}
    </button>
  );
}
