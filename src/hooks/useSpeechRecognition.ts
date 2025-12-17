import { useState, useCallback, useRef, useEffect, useMemo } from "react";

interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}
interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}
interface SpeechRecognitionResult {
  isFinal: boolean;
  length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}
interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}
interface SpeechRecognitionErrorEvent extends Event {
  error: string;
}
interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: (() => void) | null;
  onspeechstart: (() => void) | null;
  onspeechend: (() => void) | null;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  start(): void;
  stop(): void;
}
interface SpeechRecognitionConstructor {
  new(): SpeechRecognitionInstance;
}
declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

export type ListeningState = "idle" | "listening_for_wakeword" | "listening_for_command" | "listening_for_reply";

interface UseSpeechRecognitionOptions {
  wakeWord?: string;
  onResult?: (transcript: string) => void;
  onCommandStart?: () => void;
  onWakeWordDetected?: () => void;
  onSpeechStart?: () => void;
  onSpeechEnd?: () => void;
  isAISpeaking?: boolean;
  isUserMicDisabled?: boolean; // User explicitly disabled mic - overrides auto-management
  isUserMicEnabled?: boolean; // User explicitly enabled mic - overrides auto-management
}

export function useSpeechRecognition(options: UseSpeechRecognitionOptions = {}) {
  const [listeningState, setListeningState] = useState<ListeningState>("idle");
  const [isSupported, setIsSupported] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const restartTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const commandTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const replyWindowTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const wakeWord = options.wakeWord || "hey buddy";
  const isAISpeakingRef = useRef(options.isAISpeaking || false);
  
  // User mic control - tracks whether user has explicitly disabled the mic
  const isUserMicDisabledRef = useRef(options.isUserMicDisabled || false);
  const isUserMicEnabledRef = useRef(options.isUserMicEnabled || false);

  console.log("[SpeechRecognition] useSpeechRecognition hook rendered/called");

  const listeningStateRef = useRef(listeningState);
  const lastFinalTranscript = useRef("");
  const isIntentionallyStopped = useRef(false);
  const replyWindowSpeechDetectedRef = useRef(false);
  const replyWindowTranscriptRef = useRef("");
  const replyWindowSilenceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const replyWindowStartTimeRef = useRef<number>(0);

  const onResultRef = useRef(options.onResult);
  const onCommandStartRef = useRef(options.onCommandStart);
  const onWakeWordDetectedRef = useRef(options.onWakeWordDetected);

  useEffect(() => {
    isAISpeakingRef.current = options.isAISpeaking || false;
  }, [options.isAISpeaking]);

  useEffect(() => {
    isUserMicDisabledRef.current = options.isUserMicDisabled || false;
    isUserMicEnabledRef.current = options.isUserMicEnabled || false;
    console.log("[SpeechRecognition] User mic control updated:", {
      disabled: isUserMicDisabledRef.current,
      enabled: isUserMicEnabledRef.current,
    });
  }, [options.isUserMicDisabled, options.isUserMicEnabled]);

  useEffect(() => {
    listeningStateRef.current = listeningState;
  }, [listeningState]);

  useEffect(() => {
    onResultRef.current = options.onResult;
    onCommandStartRef.current = options.onCommandStart;
    onWakeWordDetectedRef.current = options.onWakeWordDetected;
  }, [options.onResult, options.onCommandStart, options.onWakeWordDetected]);

  const onResult = useMemo(() => options.onResult, [options.onResult]);
  const onCommandStart = useMemo(() => options.onCommandStart, [options.onCommandStart]);
  const onWakeWordDetected = useMemo(() => options.onWakeWordDetected, [options.onWakeWordDetected]);

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      console.error("[SpeechRecognition] NOT SUPPORTED - Browser does not support Web Speech API");
      console.log("[SpeechRecognition] window.SpeechRecognition:", window.SpeechRecognition);
      console.log("[SpeechRecognition] window.webkitSpeechRecognition:", window.webkitSpeechRecognition);
      setIsSupported(false);
      return;
    }

    console.log("[SpeechRecognition] ✓ Browser supports Web Speech API");
    setIsSupported(true);

    const recognition = new SpeechRecognition();
    console.log("[SpeechRecognition] Recognition instance created");

    recognition.onstart = () => {
      console.log("[SpeechRecognition] ✓ onstart event - Service has started listening");
    };

    recognition.onspeechstart = () => {
      console.log("[SpeechRecognition] ✓ onspeechstart event - Audio/speech input detected");
      const currentState = listeningStateRef.current;
      const timeSinceReplyWindowStart = Date.now() - replyWindowStartTimeRef.current;
      
      if (currentState === "listening_for_reply") {
        console.log(`[SpeechRecognition] 🎤 Speech detected in reply window (${timeSinceReplyWindowStart}ms since reply started)`);
        
        if (timeSinceReplyWindowStart < 300) {
          console.log("[SpeechRecognition] ⚠️ Speech detected too soon after reply window opened - likely AI echo, will ignore");
        }
      }
    };

    recognition.onspeechend = () => {
      console.log("[SpeechRecognition] ✗ onspeechend event - Speech/audio has stopped being detected");
      
      if (listeningStateRef.current === "listening_for_reply" && replyWindowSpeechDetectedRef.current) {
        console.log("[SpeechRecognition] 🎙️ User stopped speaking, waiting 500ms to ensure we have final text...");
        
        if (replyWindowSilenceTimeoutRef.current) {
          clearTimeout(replyWindowSilenceTimeoutRef.current);
        }
        
        replyWindowSilenceTimeoutRef.current = setTimeout(() => {
          const accumulatedText = replyWindowTranscriptRef.current.trim();
          if (accumulatedText) {
            console.log(`[SpeechRecognition] 🎙️ [onspeechend] Submitting accumulated text after silence: "${accumulatedText}"`);
            
            if (replyWindowTimeoutRef.current) {
              clearTimeout(replyWindowTimeoutRef.current);
              replyWindowTimeoutRef.current = null;
            }
            
            onResultRef.current?.(accumulatedText);
            onResult?.(accumulatedText);
            
            replyWindowSpeechDetectedRef.current = false;
            replyWindowTranscriptRef.current = "";
            lastFinalTranscript.current = "";
            setListeningState("listening_for_wakeword");
            recognitionRef.current?.stop();
          }
          replyWindowSilenceTimeoutRef.current = null;
        }, 500);
      }
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interimTranscript = "";
      let finalTranscript = "";

      console.log(`[SpeechRecognition] ✓ onresult event - resultIndex: ${event.resultIndex}, total results: ${event.results.length}`);

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const transcript = event.results[i][0].transcript;
        const confidence = event.results[i][0].confidence;
        const isFinal = event.results[i].isFinal;

        console.log(
          `[SpeechRecognition]   → Result ${i}: "${transcript}" (confidence: ${(confidence * 100).toFixed(1)}%, final: ${isFinal})`
        );

        if (isFinal) {
          finalTranscript += transcript;
        } else {
          interimTranscript += transcript;
        }
      }

      if (interimTranscript) {
        console.log(`[SpeechRecognition] 🎤 Interim (live): "${interimTranscript}"`);

        if (listeningStateRef.current === "listening_for_wakeword") {
          const wakeWordLower = wakeWord.toLowerCase();
          const interimLower = interimTranscript.toLowerCase();
          if (interimLower.includes(wakeWordLower)) {
            console.log("[SpeechRecognition] 🎯 WAKE WORD DETECTED IN INTERIM!");
            if (isAISpeakingRef.current) {
              console.log("[SpeechRecognition] 🛑 AI INTERRUPTED - User said wake word while AI was speaking!");
            }
            onWakeWordDetectedRef.current?.();
          }
        }
        
        if (listeningStateRef.current === "listening_for_reply" && !isAISpeakingRef.current) {
          const timeSinceReplyWindowStart = Date.now() - replyWindowStartTimeRef.current;
          
          if (timeSinceReplyWindowStart < 300) {
            console.log(`[SpeechRecognition] ⏭️ Ignoring interim in reply mode - too soon (${timeSinceReplyWindowStart}ms), likely AI echo: "${interimTranscript}"`);
            return;
          }
          
          console.log(`[SpeechRecognition] 🎤 Reply mode - interim detected: "${interimTranscript}"`);
          if (!replyWindowSpeechDetectedRef.current) {
            console.log("[SpeechRecognition] 📍 First speech detected in reply window (interim), starting to accumulate...");
            replyWindowSpeechDetectedRef.current = true;
            
            if (replyWindowTimeoutRef.current) {
              clearTimeout(replyWindowTimeoutRef.current);
              replyWindowTimeoutRef.current = null;
              console.log("[SpeechRecognition] ✓ Cleared reply window timeout (speech detected in interim)");
            }
          }
        }
      }

      if (finalTranscript) {
        console.log(`[SpeechRecognition] ✅ FINAL TEXT: "${finalTranscript}"`);

        if (finalTranscript === lastFinalTranscript.current) {
          console.log("[SpeechRecognition] ⏭️ Skipping duplicate final transcript");
          return;
        }

        lastFinalTranscript.current = finalTranscript;

        const currentState = listeningStateRef.current;
        console.log(`[SpeechRecognition] Current listening state: ${currentState}`);

        if (currentState === "listening_for_wakeword") {
          const wakeWordLower = wakeWord.toLowerCase();
          const finalLower = finalTranscript.toLowerCase();
          const wakeWordIndex = finalLower.indexOf(wakeWordLower);

          console.log(`[SpeechRecognition] Checking for wake word "${wakeWord}" in "${finalTranscript}"`);

          if (wakeWordIndex !== -1) {
            console.log("[SpeechRecognition] 🎯 WAKE WORD DETECTED!");
            
            if (isAISpeakingRef.current) {
              console.log("[SpeechRecognition] 🛑 AI INTERRUPTED - User said wake word while AI was speaking!");
            }
            
            onWakeWordDetectedRef.current?.();
            isIntentionallyStopped.current = true;
            lastFinalTranscript.current = "";
            recognitionRef.current?.stop();

            const command = finalTranscript
              .substring(wakeWordIndex + wakeWord.length)
              .trim();

            if (command) {
              console.log(`[SpeechRecognition] 🎙️ Command with wake word: "${command}"`);
              onResultRef.current?.(command);
            } else {
              console.log("[SpeechRecognition] Wake word detected but no command yet. Waiting for command (2 second timeout)...");
              lastFinalTranscript.current = "";
              setListeningState("listening_for_command");
              onCommandStartRef.current?.();

              if (commandTimeoutRef.current) {
                clearTimeout(commandTimeoutRef.current);
              }
              commandTimeoutRef.current = setTimeout(() => {
                console.log("[SpeechRecognition] ⏱️ Command timeout (2 seconds) - no speech after wake word. Going back to continuous listening...");
                setListeningState("listening_for_wakeword");
                isIntentionallyStopped.current = false;
                commandTimeoutRef.current = null;
                try {
                  recognitionRef.current?.stop();
                  console.log("[SpeechRecognition] ✓ Stopped recognition to return to continuous listening");
                } catch (error) {
                  console.error("[SpeechRecognition] Error stopping recognition:", error);
                }
              }, 2000);
            }
          } else {
            console.log(`[SpeechRecognition] Wake word not found. Continuing to listen...`);
          }
        } else if (currentState === "listening_for_command") {
          console.log(`[SpeechRecognition] 🎙️ Processing command: "${finalTranscript}"`);
          
          if (commandTimeoutRef.current) {
            clearTimeout(commandTimeoutRef.current);
            commandTimeoutRef.current = null;
            console.log("[SpeechRecognition] ✓ Cleared command timeout (command received)");
          }
          
          onResultRef.current?.(finalTranscript);
          lastFinalTranscript.current = "";
          setListeningState("listening_for_wakeword");
          recognitionRef.current?.stop();
        } else if (currentState === "listening_for_reply") {
          if (isAISpeakingRef.current) {
            console.log(`[SpeechRecognition] ⏸️ AI is still speaking, ignoring transcript: "${finalTranscript}"`);
            lastFinalTranscript.current = "";
            return;
          }

          const timeSinceReplyWindowStart = Date.now() - replyWindowStartTimeRef.current;
          
          if (timeSinceReplyWindowStart < 300) {
            console.log(`[SpeechRecognition] ⏭️ Ignoring final text in reply mode - too soon (${timeSinceReplyWindowStart}ms), likely AI echo: "${finalTranscript}"`);
            lastFinalTranscript.current = "";
            return;
          }

          console.log(`[SpeechRecognition] 🎙️ Detected speech in reply window: "${finalTranscript}"`);
          
          if (!replyWindowSpeechDetectedRef.current) {
            console.log("[SpeechRecognition] 📍 First speech detected in reply window, starting to accumulate text...");
            replyWindowSpeechDetectedRef.current = true;
            
            if (replyWindowTimeoutRef.current) {
              clearTimeout(replyWindowTimeoutRef.current);
              replyWindowTimeoutRef.current = null;
              console.log("[SpeechRecognition] ✓ Cleared reply window timeout (speech detected)");
            }
          }
          
          const wakeWordLower = wakeWord.toLowerCase();
          const finalLower = finalTranscript.toLowerCase();
          const wakeWordIndex = finalLower.indexOf(wakeWordLower);
          
          let textToAccumulate = finalTranscript;
          if (wakeWordIndex !== -1) {
            textToAccumulate = finalTranscript.substring(wakeWordIndex + wakeWord.length).trim();
            console.log(`[SpeechRecognition] 🚫 Removed wake word. Original: "${finalTranscript}" → Cleaned: "${textToAccumulate}"`);
          }
          
          if (textToAccumulate) {
            replyWindowTranscriptRef.current += (replyWindowTranscriptRef.current ? " " : "") + textToAccumulate;
            console.log(`[SpeechRecognition] 📝 Accumulated text so far: "${replyWindowTranscriptRef.current}"`);
          }
          lastFinalTranscript.current = "";
          
          if (replyWindowTimeoutRef.current) {
            clearTimeout(replyWindowTimeoutRef.current);
          }
          
          replyWindowTimeoutRef.current = setTimeout(() => {
            console.log("[SpeechRecognition] ⏱️ No new speech detected for 1 second, submitting accumulated text...");
            const accumulatedText = replyWindowTranscriptRef.current.trim();
            if (accumulatedText) {
              console.log(`[SpeechRecognition] 🎙️ Submitting reply: "${accumulatedText}"`);
              onResultRef.current?.(accumulatedText);
              
              replyWindowSpeechDetectedRef.current = false;
              replyWindowTranscriptRef.current = "";
              lastFinalTranscript.current = "";
              setListeningState("listening_for_wakeword");
              replyWindowTimeoutRef.current = null;
              recognitionRef.current?.stop();
            }
          }, 1000);
        }
      }
    };

    recognition.onend = () => {
      console.log("[SpeechRecognition] ✗ onend event - recognition service ended");
      const currentState = listeningStateRef.current;
      console.log(`[SpeechRecognition] Current state on end: ${currentState}`);
      console.log(`[SpeechRecognition] isIntentionallyStopped: ${isIntentionallyStopped.current}`);

      if (currentState === "listening_for_reply" && replyWindowSpeechDetectedRef.current) {
        const accumulatedText = replyWindowTranscriptRef.current.trim();
        if (accumulatedText) {
          console.log(`[SpeechRecognition] 🎙️ [FALLBACK] User stopped talking in reply window. Sending accumulated text: "${accumulatedText}"`);
          
          if (replyWindowTimeoutRef.current) {
            clearTimeout(replyWindowTimeoutRef.current);
            replyWindowTimeoutRef.current = null;
          }
          
          onResultRef.current?.(accumulatedText);
          
          replyWindowSpeechDetectedRef.current = false;
          replyWindowTranscriptRef.current = "";
          lastFinalTranscript.current = "";
          setListeningState("listening_for_wakeword");
          isIntentionallyStopped.current = false;
          return;
        }
      }

      if (currentState !== "idle" && !isIntentionallyStopped.current) {
        console.log("[SpeechRecognition] ↻ Restarting recognition service for continuous listening...");
        try {
          recognitionRef.current?.start();
          console.log("[SpeechRecognition] ✓ Recognition service restarted");
        } catch (error) {
          console.error("[SpeechRecognition] Failed to restart:", error);
        }
      } else {
        console.log("[SpeechRecognition] Recognition service stopped (user requested idle state)");
      }
      isIntentionallyStopped.current = false;
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error("[SpeechRecognition] ❌ ERROR EVENT:", event.error);
    };

    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    console.log("[SpeechRecognition] Configuration set: continuous=true, interimResults=true, lang=en-US");

    recognitionRef.current = recognition;

    return () => {
      console.log("[SpeechRecognition] Cleanup: Cleaning up recognition instance");
      if (restartTimeoutRef.current) {
        clearTimeout(restartTimeoutRef.current);
        restartTimeoutRef.current = null;
      }
      if (commandTimeoutRef.current) {
        clearTimeout(commandTimeoutRef.current);
        commandTimeoutRef.current = null;
      }
      if (replyWindowTimeoutRef.current) {
        clearTimeout(replyWindowTimeoutRef.current);
        replyWindowTimeoutRef.current = null;
      }
      if (replyWindowSilenceTimeoutRef.current) {
        clearTimeout(replyWindowSilenceTimeoutRef.current);
        replyWindowSilenceTimeoutRef.current = null;
      }
      isIntentionallyStopped.current = false;
      lastFinalTranscript.current = "";
      replyWindowSpeechDetectedRef.current = false;
      replyWindowTranscriptRef.current = "";
      if (recognitionRef.current) {
        recognitionRef.current.onstart = null;
        recognitionRef.current.onspeechstart = null;
        recognitionRef.current.onspeechend = null;
        recognitionRef.current.onresult = null;
        recognitionRef.current.onend = null;
        recognitionRef.current.onerror = null;
        try {
          recognitionRef.current.stop();
        } catch (e) {
        }
      }
    };
  }, []);

  const startListening = useCallback(async () => {
    console.log("[SpeechRecognition] startListening called");
    console.log(`[SpeechRecognition] Current state: ${listeningStateRef.current}, isSupported: ${isSupported}`);

    if (!recognitionRef.current) {
      console.error("[SpeechRecognition] ❌ Recognition instance not initialized!");
      return;
    }

    if (listeningStateRef.current !== "idle") {
      console.warn("[SpeechRecognition] ⚠️ Already listening, ignoring start request");
      return;
    }

    console.log("[SpeechRecognition] 🎤 Requesting microphone permission with echo cancellation...");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: false,
          sampleRate: 16000
        }
      });
      console.log("[SpeechRecognition] ✓ Microphone permission granted with echo cancellation!");

      stream.getTracks().forEach(track => {
        console.log(`[SpeechRecognition] Stopping track: ${track.kind}`);
        track.stop();
      });
    } catch (error) {
      console.error("[SpeechRecognition] ❌ Microphone permission denied or error:", error);
      return;
    }

    console.log("[SpeechRecognition] → Starting continuous listening for wake word...");
    isIntentionallyStopped.current = false;
    setListeningState("listening_for_wakeword");

    try {
      recognitionRef.current.start();
      console.log("[SpeechRecognition] ✓ start() method called successfully");
      console.log("[SpeechRecognition] 🎤 Waiting for onstart event...");
    } catch (error) {
      console.error("[SpeechRecognition] ❌ Error starting recognition:", error);
    }
  }, [isSupported]);

  const stopListening = useCallback(() => {
    console.log("[SpeechRecognition] stopListening called");
    console.log(`[SpeechRecognition] Current state: ${listeningStateRef.current}`);

    if (!recognitionRef.current) {
      console.error("[SpeechRecognition] Recognition instance not initialized!");
      return;
    }

    if (listeningStateRef.current === "idle") {
      console.warn("[SpeechRecognition] Already idle, ignoring stop request");
      return;
    }

    console.log("[SpeechRecognition] → Stopping listening...");
    isIntentionallyStopped.current = true;
    setListeningState("idle");

    if (restartTimeoutRef.current) {
      clearTimeout(restartTimeoutRef.current);
      restartTimeoutRef.current = null;
    }

    if (commandTimeoutRef.current) {
      clearTimeout(commandTimeoutRef.current);
      commandTimeoutRef.current = null;
    }

    if (replyWindowTimeoutRef.current) {
      clearTimeout(replyWindowTimeoutRef.current);
      replyWindowTimeoutRef.current = null;
    }

    if (replyWindowSilenceTimeoutRef.current) {
      clearTimeout(replyWindowSilenceTimeoutRef.current);
      replyWindowSilenceTimeoutRef.current = null;
    }

    try {
      recognitionRef.current.stop();
      console.log("[SpeechRecognition] ✓ Recognition service stopped");
    } catch (error) {
      console.error("[SpeechRecognition] Error stopping recognition:", error);
    }
  }, []);

  const pauseRecognition = useCallback(() => {
    console.log("[SpeechRecognition] ⏸️ pauseRecognition called - DEPRECATED: Recognition now stays active during AI speech for interruptions");
  }, []);

  const restartListeningAfterDelay = useCallback((delayMs: number = 500) => {
    console.log(`[SpeechRecognition] restartListeningAfterDelay called - DEPRECATED: Recognition stays active`);
  }, []);

  const enableReplyWindow = useCallback(() => {
    console.log("[SpeechRecognition] enableReplyWindow called - Switching to reply listening mode");
    console.log(`[SpeechRecognition] Current state: ${listeningStateRef.current}`);
    
    // ⚠️ RESPECT USER MIC CONTROL: If user explicitly disabled mic, don't auto-enable
    if (isUserMicDisabledRef.current) {
      console.log("[SpeechRecognition] ⚠️ User has explicitly disabled mic - NOT enabling reply window (respecting user intent)");
      return;
    }

    if (!recognitionRef.current) {
      console.error("[SpeechRecognition] Recognition instance not initialized!");
      return;
    }

    if (replyWindowTimeoutRef.current) {
      clearTimeout(replyWindowTimeoutRef.current);
      replyWindowTimeoutRef.current = null;
    }

    if (replyWindowSilenceTimeoutRef.current) {
      clearTimeout(replyWindowSilenceTimeoutRef.current);
      replyWindowSilenceTimeoutRef.current = null;
    }

    console.log("[SpeechRecognition] 🧹 Clearing all audio buffers to prevent echo...");
    lastFinalTranscript.current = "";
    replyWindowTranscriptRef.current = "";
    replyWindowSpeechDetectedRef.current = false;
    replyWindowStartTimeRef.current = Date.now();

    isIntentionallyStopped.current = false;

    console.log("[SpeechRecognition] 🎯 Entering reply window - user can speak without saying wake word");
    setListeningState("listening_for_reply");

    console.log("[SpeechRecognition] 🔄 FORCE RESTARTING recognition to clear interim buffer from AI speech...");
    try {
      recognitionRef.current.stop();
      console.log("[SpeechRecognition] ✓ Stopped recognition");
    } catch (error) {
      console.log("[SpeechRecognition] Recognition already stopped");
    }

    setTimeout(() => {
      replyWindowStartTimeRef.current = Date.now();
      console.log("[SpeechRecognition] ▶️ Starting fresh recognition session...");
      try {
        recognitionRef.current?.start();
        console.log("[SpeechRecognition] ✓ Recognition restarted with FRESH buffer (no echo)");
      } catch (error) {
        console.error("[SpeechRecognition] Error restarting recognition:", error);
      }
    }, 100);

    replyWindowTimeoutRef.current = setTimeout(() => {
      console.log("[SpeechRecognition] ⏱️ Reply window timeout (2 seconds) - No speech detected. Reverting to wake word mode...");
      setListeningState("listening_for_wakeword");
      replyWindowTimeoutRef.current = null;
      try {
        recognitionRef.current?.stop();
        console.log("[SpeechRecognition] ✓ Stopped recognition to return to wake word mode");
      } catch (error) {
        console.error("[SpeechRecognition] Error stopping recognition:", error);
      }
    }, 2000);

    console.log("[SpeechRecognition] ⏱️ Reply window timer started (2 seconds)");
  }, []);

  return {
    isSupported,
    listeningState,
    startListening,
    stopListening,
    pauseRecognition,
    restartListeningAfterDelay,
    enableReplyWindow,
  };
}