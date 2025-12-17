import { useState, useCallback, useRef } from "react";

/**
 * Global hook to manage user-controlled microphone state.
 * 
 * The user can explicitly turn the microphone on or off, and this state
 * should override any automatic triggers (like AI speech ending).
 * 
 * This ensures the mic button truly toggles on/off based on user intent,
 * not automatic system events.
 */
export function useUserMicControl() {
  const [userMicEnabled, setUserMicEnabled] = useState(false);
  const userIntentionRef = useRef(true); // Initialize as TRUE - user starts with mic OFF by intention

  /**
   * Called when the user explicitly clicks the mic button to turn it on
   */
  const enableMicByUser = useCallback(() => {
    console.log("[UserMicControl] User explicitly enabled mic");
    userIntentionRef.current = true;
    setUserMicEnabled(true);
  }, []);

  /**
   * Called when the user explicitly clicks the mic button to turn it off
   */
  const disableMicByUser = useCallback(() => {
    console.log("[UserMicControl] User explicitly disabled mic");
    userIntentionRef.current = true;
    setUserMicEnabled(false);
  }, []);

  /**
   * Toggle mic by user - called when user clicks the button
   */
  const toggleMicByUser = useCallback(() => {
    const newState = !userMicEnabled;
    console.log(`[UserMicControl] User toggled mic: ${userMicEnabled ? "OFF" : "ON"}`);
    userIntentionRef.current = true;
    setUserMicEnabled(newState);
    return newState;
  }, [userMicEnabled]);

  /**
   * Check if user has explicitly disabled the mic
   * Returns true if the user has manually turned OFF the mic
   */
  const isUserMicDisabled = useCallback(() => {
    return userIntentionRef.current && !userMicEnabled;
  }, [userMicEnabled]);

  /**
   * Check if user has explicitly enabled the mic
   * Returns true if the user has manually turned ON the mic
   */
  const isUserMicEnabled = useCallback(() => {
    return userIntentionRef.current && userMicEnabled;
  }, [userMicEnabled]);

  /**
   * Reset user intention (called when auto-actions should be allowed again)
   * This is used internally to allow the system to auto-manage the mic
   * after a period of time or certain conditions
   */
  const clearUserIntention = useCallback(() => {
    console.log("[UserMicControl] Clearing user intention flag");
    userIntentionRef.current = false;
  }, []);

  return {
    userMicEnabled,
    enableMicByUser,
    disableMicByUser,
    toggleMicByUser,
    isUserMicDisabled,
    isUserMicEnabled,
    clearUserIntention,
  };
}
