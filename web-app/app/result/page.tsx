"use client";

import {
    speak as elevenLabsSpeak,
    fallbackSpeak,
    VOICES,
} from "@/lib/elevenlabs";
import { FileText, Home, Pause, Play, Volume2, VolumeX } from "lucide-react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";

function ResultPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Get data from sessionStorage instead of URL params to avoid HTTP 431 error
  const resultId = searchParams.get("id");
  const storedData = resultId ? sessionStorage.getItem(resultId) : null;
  const data = storedData ? JSON.parse(storedData) : {};

  const imageUri = data.imageUri || searchParams.get("imageUri") || "";
  const title = data.title || searchParams.get("title") || "Untitled";
  const artist = data.artist || searchParams.get("artist") || "Unknown Artist";
  const type = data.type || searchParams.get("type") || "";
  const description = data.description || searchParams.get("description") || "";
  const historicalPrompt =
    data.historicalPrompt || searchParams.get("historicalPrompt") || "";
  const immersivePrompt =
    data.immersivePrompt || searchParams.get("immersivePrompt") || "";
  const emotions =
    data.emotions ||
    (searchParams.get("emotions")
      ? JSON.parse(searchParams.get("emotions")!)
      : []);
  const audioUri = data.audioUri || searchParams.get("audioUri") || "";
  const mode = data.mode || searchParams.get("mode") || "museum";

  const [isPlayingMusic, setIsPlayingMusic] = useState(false);
  const [isPlayingHistorical, setIsPlayingHistorical] = useState(false);
  const [isPlayingImmersive, setIsPlayingImmersive] = useState(false);
  const [showHistoricalTranscript, setShowHistoricalTranscript] =
    useState(false);
  const [showImmersiveTranscript, setShowImmersiveTranscript] = useState(false);
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(
    null,
  );
  const ttsAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    // Auto-play music when available
    if (audioUri) {
      playMusic();
    }
    return () => {
      if (audioElement) {
        audioElement.pause();
      }
      if (ttsAudioRef.current) {
        ttsAudioRef.current.pause();
      }
      if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioUri]);

  const playMusic = () => {
    if (audioUri) {
      const audio = new Audio(audioUri);
      audio.play();
      setAudioElement(audio);
      setIsPlayingMusic(true);

      audio.onended = () => {
        setIsPlayingMusic(false);
      };
    }
  };

  const stopMusic = () => {
    if (audioElement) {
      audioElement.pause();
      setIsPlayingMusic(false);
    }
  };

  const speakText = async (
    text: string,
    onStart: () => void,
    onEnd: () => void,
  ) => {
    // Stop any current TTS
    if (ttsAudioRef.current) {
      ttsAudioRef.current.pause();
      ttsAudioRef.current = null;
    }
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }

    try {
      // Try ElevenLabs first
      onStart();
      const audio = await elevenLabsSpeak(text, {
        voiceId: mode === "museum" ? VOICES.rachel : VOICES.bella,
        stability: 0.5,
        similarityBoost: 0.75,
      });

      ttsAudioRef.current = audio;
      audio.onended = onEnd;
      audio.onerror = () => {
        console.log("ElevenLabs playback error, trying fallback");
        onEnd();
      };
    } catch (error) {
      console.log("ElevenLabs failed, using browser TTS:", error);
      // Fallback to browser TTS
      fallbackSpeak(text, { rate: 0.9, pitch: 1.0, volume: 1.0 });

      // Since browser TTS doesn't return audio element, we manually trigger callbacks
      onStart();
      // Browser TTS doesn't have reliable onend, so we estimate based on text length
      const estimatedDuration = (text.length / 15) * 1000; // ~15 chars per second
      setTimeout(onEnd, estimatedDuration);
    }
  };

  const stopSpeaking = () => {
    if (ttsAudioRef.current) {
      ttsAudioRef.current.pause();
      ttsAudioRef.current = null;
    }
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
  };

  const handlePlayHistorical = () => {
    if (isPlayingHistorical) {
      stopSpeaking();
      setIsPlayingHistorical(false);
    } else {
      if (isPlayingImmersive) {
        stopSpeaking();
        setIsPlayingImmersive(false);
      }

      const textToRead = historicalPrompt || description;
      if (textToRead) {
        setShowHistoricalTranscript(true);
        speakText(
          textToRead,
          () => setIsPlayingHistorical(true),
          () => setIsPlayingHistorical(false),
        );
      }
    }
  };

  const handlePlayImmersive = () => {
    if (isPlayingImmersive) {
      stopSpeaking();
      setIsPlayingImmersive(false);
    } else {
      if (isPlayingHistorical) {
        stopSpeaking();
        setIsPlayingHistorical(false);
      }

      if (immersivePrompt) {
        setShowImmersiveTranscript(true);
        speakText(
          immersivePrompt,
          () => setIsPlayingImmersive(true),
          () => setIsPlayingImmersive(false),
        );
      }
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black">
      {/* Header */}
      <header className="border-b border-gray-700 bg-gray-900/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-white">Analysis Results</h1>
            <button
              onClick={() => router.push("/")}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-white transition-colors"
            >
              <Home className="w-5 h-5" />
              Home
            </button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Image Display */}
        {imageUri && (
          <div className="mb-8 rounded-xl overflow-hidden bg-gray-800 shadow-2xl">
            <div className="relative w-full aspect-video">
              <Image
                src={imageUri}
                alt={title}
                fill
                className="object-contain"
              />
            </div>
          </div>
        )}

        {/* Title and Basic Info */}
        <div className="mb-8 text-center">
          <h2 className="text-4xl font-bold text-white mb-2">{title}</h2>
          <p className="text-xl text-gray-300 mb-1">{artist}</p>
          <p className="text-gray-400">{type}</p>

          {emotions.length > 0 && (
            <div className="flex flex-wrap gap-2 justify-center mt-4">
              {emotions.map((emotion, index) => (
                <span
                  key={index}
                  className="px-3 py-1 rounded-full bg-gray-700 text-gray-200 text-sm"
                >
                  {emotion}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Music Player */}
        {audioUri && (
          <div className="mb-8 p-6 rounded-xl bg-gray-800 border border-gray-700">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Volume2 className="w-6 h-6 text-blue-400" />
                <div>
                  <h3 className="text-white font-semibold">Generated Music</h3>
                  <p className="text-gray-400 text-sm">
                    Inspired by this artwork
                  </p>
                </div>
              </div>
              <button
                onClick={isPlayingMusic ? stopMusic : playMusic}
                className="p-3 rounded-full bg-blue-500 hover:bg-blue-600 text-white transition-colors"
              >
                {isPlayingMusic ? (
                  <Pause className="w-6 h-6" />
                ) : (
                  <Play className="w-6 h-6" />
                )}
              </button>
            </div>
          </div>
        )}

        {/* Historical Description */}
        {(historicalPrompt || description) && (
          <div className="mb-6 p-6 rounded-xl bg-gray-800 border border-gray-700">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <FileText className="w-6 h-6 text-green-400" />
                <h3 className="text-white font-semibold text-lg">
                  Historical Context
                </h3>
              </div>
              <button
                onClick={handlePlayHistorical}
                className={`p-2 rounded-lg transition-colors ${
                  isPlayingHistorical
                    ? "bg-green-500 hover:bg-green-600"
                    : "bg-gray-700 hover:bg-gray-600"
                } text-white`}
              >
                {isPlayingHistorical ? (
                  <VolumeX className="w-5 h-5" />
                ) : (
                  <Volume2 className="w-5 h-5" />
                )}
              </button>
            </div>
            {showHistoricalTranscript && (
              <p className="text-gray-300 leading-relaxed">
                {historicalPrompt || description}
              </p>
            )}
          </div>
        )}

        {/* Immersive Description */}
        {immersivePrompt && (
          <div className="mb-6 p-6 rounded-xl bg-gray-800 border border-gray-700">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <FileText className="w-6 h-6 text-purple-400" />
                <h3 className="text-white font-semibold text-lg">
                  Immersive Experience
                </h3>
              </div>
              <button
                onClick={handlePlayImmersive}
                className={`p-2 rounded-lg transition-colors ${
                  isPlayingImmersive
                    ? "bg-purple-500 hover:bg-purple-600"
                    : "bg-gray-700 hover:bg-gray-600"
                } text-white`}
              >
                {isPlayingImmersive ? (
                  <VolumeX className="w-5 h-5" />
                ) : (
                  <Volume2 className="w-5 h-5" />
                )}
              </button>
            </div>
            {showImmersiveTranscript && (
              <p className="text-gray-300 leading-relaxed">{immersivePrompt}</p>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-4 justify-center mt-8">
          <button
            onClick={() => router.push(`/scan/${mode}`)}
            className="px-6 py-3 rounded-lg bg-blue-500 hover:bg-blue-600 text-white font-semibold transition-colors"
          >
            Analyze Another
          </button>
          <button
            onClick={() => router.push("/history")}
            className="px-6 py-3 rounded-lg bg-gray-700 hover:bg-gray-600 text-white font-semibold transition-colors"
          >
            View History
          </button>
        </div>
      </main>
    </div>
  );
}

export default function ResultPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black flex items-center justify-center">
          <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-white" />
        </div>
      }
    >
      <ResultPageContent />
    </Suspense>
  );
}
