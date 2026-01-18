import { Audio } from 'expo-av';
import React, { useRef } from 'react';
import { Pressable, PressableProps } from 'react-native';
import { announceOrSpeak, getScreenReaderEnabled, getTTSEnabled, hapticImpact, speak } from '../app/accessibility';

type VOProps = PressableProps & {
  accessibilityHint?: string;
  detailedDescription?: string; // long description spoken on long-press
  doubleTapDelay?: number; // ms window to accept second tap for activation when SR is off
  hapticOnLongPress?: boolean;
  // allow style arrays (match RN Pressable style prop flexibility)
  containerStyle?: any;
};

// Play a simple click sound
const playClickSound = async () => {
  try {
    const { sound } = await Audio.Sound.createAsync(
      { uri: 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAAABmYWN0BAAAAAAAAABkYXRhAAAAAA==' },
      { shouldPlay: true, volume: 0.2 }
    );
    sound.setOnPlaybackStatusUpdate((status) => {
      if (status.isLoaded && status.didJustFinish) {
        sound.unloadAsync();
      }
    });
  } catch {
    // Ignore
  }
};

export default function VOPressable({ onPress, onLongPress, accessibilityHint, detailedDescription, doubleTapDelay = 700, hapticOnLongPress = true, accessibilityLabel, children, containerStyle, ...rest }: VOProps) {
  const lastTapRef = useRef<number | null>(null);
  const confirmTimer = useRef<any>(null);

  function clearTap() {
    if (confirmTimer.current) {
      clearTimeout(confirmTimer.current);
      confirmTimer.current = null;
    }
    lastTapRef.current = null;
  }

  const handlePress = (e: any) => {
    const sr = getScreenReaderEnabled();
    const ttsEnabled = getTTSEnabled();
    
    if (sr) {
      // When screen reader is enabled, native VoiceOver handles single-tap focus / double-tap activation.
      // Press events are fired on activation (double-tap), so forward directly.
      playClickSound();
      if (onPress) onPress(e);
      return;
    }

    // If TTS is disabled, skip discovery mode and activate immediately
    if (!ttsEnabled) {
      playClickSound();
      if (onPress) onPress(e);
      return;
    }

    // When screen reader is not enabled and TTS is enabled, emulate VoiceOver discovery behavior:
    // First tap announces the label/hint. Second tap within window activates.
    const now = Date.now();
    if (lastTapRef.current && now - lastTapRef.current < doubleTapDelay) {
      // activate
      clearTap();
      playClickSound();
      if (onPress) onPress(e);
      return;
    }

    // announce briefly and wait for second tap
    lastTapRef.current = now;
    const text = accessibilityLabel || accessibilityHint || detailedDescription || '';
    if (text) speak(text);

    confirmTimer.current = setTimeout(() => {
      clearTap();
    }, doubleTapDelay);
  };

  const handleLongPress = (e: any) => {
    const longText = detailedDescription || accessibilityHint || accessibilityLabel;
    if (longText) {
      announceOrSpeak(longText);
    }
    if (hapticOnLongPress) {
      hapticImpact('light');
    }
    // Forward to provided onLongPress (if any)
    if (onLongPress) onLongPress(e);
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      onPress={handlePress}
      onLongPress={handleLongPress}
      style={containerStyle}
      {...rest}
    >
      {children}
    </Pressable>
  );
}
