"use client";

import { Camera, Home, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useOvershootVision } from "../../components/OvershootVision";
import { ArtBeyondSightAPI } from "../../lib/api";
import { textToSpeech, VOICES } from "../../lib/elevenlabs";

interface Detection {
  timestamp: string;
  type: "museum" | "monuments" | "landscape";
  confidence: number;
  description: string;
  title?: string;
  analyzing?: boolean;
}

export default function RealtimeVisionPage() {
  const router = useRouter();
  const [detections, setDetections] = useState<Detection[]>([]);
  const [isActive, setIsActive] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [guidanceMessage, setGuidanceMessage] = useState<string>("");
  const [latestResult, setLatestResult] = useState<{
    title: string;
    artist: string;
    description: string;
    historicalPrompt?: string;
    immersivePrompt?: string;
    audioUri?: string | null;
    type?: string;
    mode: Detection["type"];
  } | null>(null);
  const [showHistorical, setShowHistorical] = useState(false);
  const [showImmersive, setShowImmersive] = useState(false);
  const [isMusicPlaying, setIsMusicPlaying] = useState(false);
  const [isTTSPlaying, setIsTTSPlaying] = useState(false);
  const [ttsType, setTtsType] = useState<"historical" | "immersive" | null>(
    null,
  );
  const [holdMessage, setHoldMessage] = useState<string>("");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ttsAudioRef = useRef<HTMLAudioElement | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const holdTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingDetectionRef = useRef<Detection | null>(null);
  const { initialize, start, stop, isInitialized } = useOvershootVision();

  const apiKey = process.env.NEXT_PUBLIC_OVERSHOOT_API_KEY || "";
  const lastDetectionRef = useRef<string>("");
  const analyzingRef = useRef(false);
  const currentArtworkRef = useRef<string | null>(null); // Track artwork being analyzed

  // Hardcoded list of paintings to cycle through
  const HARDCODED_PAINTINGS = [
    "Jefferson Market Courthouse",
    "Central Park Winter",
    "Bicycles",
  ];
  const paintingIndexRef = useRef(0);

  const handleArtworkDetected = (detection: {
    type: "museum" | "monuments" | "landscape";
    confidence: number;
    description: string;
    title?: string;
  }) => {
    console.log("🎨 Artwork detected!", detection);

    // Validate detection before proceeding
    if (!isValidDetection(detection)) {
      console.log(
        "⛔ Detection ignored - not a valid artwork/monument/landscape",
      );
      return;
    }

    // Use hardcoded painting name from the list
    const hardcodedName = HARDCODED_PAINTINGS[paintingIndexRef.current];
    console.log(
      "📝 Using hardcoded painting:",
      hardcodedName,
      "(index:",
      paintingIndexRef.current,
      ")",
    );

    // If we're currently analyzing an artwork, ignore new detections
    if (currentArtworkRef.current) {
      console.log("⏸️ Still analyzing current artwork, ignoring detection");
      return;
    }

    if (analyzingRef.current) {
      console.log("⏳ Analysis in flight, ignoring new detection");
      return;
    }

    if (holdTimeoutRef.current) {
      console.log("⏸️ Already holding for a detection, skipping new one");
      return;
    }

    const newDetection: Detection = {
      timestamp: new Date().toLocaleTimeString(),
      type: detection.type,
      confidence: detection.confidence,
      description: detection.description,
      title: hardcodedName, // Use hardcoded painting name
      analyzing: false,
    };

    pendingDetectionRef.current = newDetection;

    setHoldMessage(
      `Detected "${hardcodedName}" — please hold still for 5 seconds while we lock focus.`,
    );

    holdTimeoutRef.current = setTimeout(async () => {
      holdTimeoutRef.current = null;
      const pending = pendingDetectionRef.current;
      if (!pending) {
        return;
      }
      setHoldMessage("Processing... please wait");
      await handleAnalyzeDetection(pending);
      setHoldMessage("");
      pendingDetectionRef.current = null;

      // Increment to next painting in the list (loop back to 0 after last one)
      paintingIndexRef.current =
        (paintingIndexRef.current + 1) % HARDCODED_PAINTINGS.length;
      console.log(
        "➡️ Next painting will be:",
        HARDCODED_PAINTINGS[paintingIndexRef.current],
      );
    }, 5000);

    setDetections((prev) => [newDetection, ...prev.slice(0, 9)]);
  };

  const normalize = (value: string) => value.trim().toLowerCase();

  const isValidDetection = (detection: {
    type: "museum" | "monuments" | "landscape";
    description: string;
    title?: string;
    confidence: number;
  }): boolean => {
    const desc = normalize(detection.description);
    const title = normalize(detection.title || "");

    // Skip if confidence is too low
    if (detection.confidence < 0.3) {
      console.log("❌ Confidence too low:", detection.confidence);
      return false;
    }

    // Valid indicators for each mode
    const validKeywords = {
      museum: [
        "painting",
        "artwork",
        "sculpture",
        "portrait",
        "landscape painting",
        "masterpiece",
        "canvas",
        "fresco",
        "mural",
        "art piece",
        "by",
        "artist",
        "painted",
        "sculpted",
        "created by",
      ],
      monuments: [
        "monument",
        "statue",
        "memorial",
        "landmark",
        "building",
        "architecture",
        "tower",
        "bridge",
        "fountain",
        "obelisk",
        "historic",
        "famous",
        "iconic",
      ],
      landscape: [
        "mountain",
        "valley",
        "river",
        "ocean",
        "forest",
        "lake",
        "sunset",
        "sunrise",
        "nature",
        "scenery",
        "vista",
        "natural",
        "wilderness",
        "countryside",
      ],
    };

    // Check for valid keywords for the specific mode
    const modeKeywords = validKeywords[detection.type];
    const hasValidKeyword = modeKeywords.some(
      (keyword) => desc.includes(keyword) || title.includes(keyword),
    );

    if (!hasValidKeyword) {
      console.log(`❌ No valid ${detection.type} keywords found in detection`);
      return false;
    }

    console.log("✅ Valid detection - proceeding with analysis");
    return true;
  };

  const pickCachedMatch = async (paintingName: string) => {
    const target = normalize(paintingName);
    const analyses = await ArtBeyondSightAPI.searchAnalysesByName(paintingName);
    return (
      analyses.find((a) => normalize(a.image_name) === target) ||
      analyses.find((a) => normalize(a.image_name).includes(target)) ||
      analyses.find((a) => target.includes(normalize(a.image_name))) ||
      null
    );
  };

  const getCachedAnalysis = async (paintingName?: string) => {
    if (!paintingName) return null;
    try {
      return await pickCachedMatch(paintingName);
    } catch (error) {
      console.warn("⚠️ Cache lookup failed, continuing to Navigator", error);
      return null;
    }
  };

  const extractArtworkName = (description: string): string => {
    const patterns = [
      /(?:image of |painting of |photograph of |picture of )(?:the |a )?([^,\.]+?)(?:\s+painting|\s+photograph|\s+artwork|\s+sculpture|\.|\,|$)/i,
      /(?:the |a )?([A-Z][^,\.]+?)(?:\s+painting|\s+photograph|\s+artwork|\s+sculpture)/i,
    ];

    for (const pattern of patterns) {
      const match = description.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
    }

    return description;
  };

  const setPreviewFromCached = (
    cached: NonNullable<Awaited<ReturnType<typeof pickCachedMatch>>>,
    mode: Detection["type"],
  ) => {
    const [historicalPrompt = "", immersivePrompt = ""] =
      cached.descriptions || [];
    setLatestResult({
      title: cached.image_name,
      artist: cached.metadata?.artist || "Unknown Artist",
      description:
        cached.metadata?.historicalPrompt || historicalPrompt || "Description",
      historicalPrompt,
      immersivePrompt,
      audioUri: cached.metadata?.audioUri || null,
      type: cached.analysis_type || mode,
      mode,
    });

    // Automatically play music if available
    if (cached.metadata?.audioUri) {
      console.log("🎵 Auto-playing music for:", cached.image_name);
      // Use setTimeout to ensure state is updated first
      setTimeout(() => {
        if (audioRef.current) {
          audioRef.current.pause();
        }
        audioRef.current = new Audio(cached.metadata.audioUri);
        audioRef.current.onended = () => setIsMusicPlaying(false);
        audioRef.current.play().catch((error) => {
          console.error("Failed to auto-play music:", error);
        });
        setIsMusicPlaying(true);
      }, 100);
    }
  };

  const handlePlayMusic = () => {
    if (!latestResult?.audioUri) return;
    if (!audioRef.current) {
      audioRef.current = new Audio(latestResult.audioUri);
      audioRef.current.onended = () => setIsMusicPlaying(false);
    }
    audioRef.current.currentTime = 0;
    audioRef.current.play();
    setIsMusicPlaying(true);
  };

  const handleStopMusic = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      setIsMusicPlaying(false);
    }
  };

  const handleReadText = async (type: "historical" | "immersive") => {
    const text =
      type === "historical"
        ? latestResult?.historicalPrompt || latestResult?.description
        : latestResult?.immersivePrompt;

    if (!text) {
      console.warn("No text available to read");
      return;
    }

    // If already reading this type, stop it
    if (isTTSPlaying && ttsType === type) {
      if (ttsAudioRef.current) {
        ttsAudioRef.current.pause();
        setIsTTSPlaying(false);
        setTtsType(null);
      }
      return;
    }

    // Stop any existing TTS
    if (ttsAudioRef.current) {
      ttsAudioRef.current.pause();
    }

    try {
      console.log(`🔊 Generating TTS for ${type} context...`);
      setIsTTSPlaying(true);
      setTtsType(type);

      const audioUrl = await textToSpeech(text, {
        voiceId: VOICES.bella,
        stability: 0.6,
        similarityBoost: 0.8,
      });

      ttsAudioRef.current = new Audio(audioUrl);
      ttsAudioRef.current.onended = () => {
        setIsTTSPlaying(false);
        setTtsType(null);
        URL.revokeObjectURL(audioUrl);
      };

      await ttsAudioRef.current.play();
      console.log("✅ TTS playing");
    } catch (error) {
      console.error("❌ TTS failed:", error);
      setIsTTSPlaying(false);
      setTtsType(null);
      alert("Failed to generate speech. Please check your ElevenLabs API key.");
    }
  };

  const handleAnalyzeDetection = async (detection: Detection) => {
    if (analyzingRef.current) {
      console.log("⚠️ Analysis already in progress, skipping...");
      return;
    }

    // Stop any currently playing music when a new painting is detected
    if (audioRef.current && isMusicPlaying) {
      console.log("🛑 Stopping previous artwork's music");
      audioRef.current.pause();
      setIsMusicPlaying(false);
    }

    analyzingRef.current = true;
    setIsAnalyzing(true);
    setDetections((prev) =>
      prev.map((d) =>
        d.timestamp === detection.timestamp ? { ...d, analyzing: true } : d,
      ),
    );

    try {
      // Extract artwork name from Overshoot detection
      const artworkName =
        detection.title?.trim() || extractArtworkName(detection.description);
      console.log("🎨 Artwork detected:", artworkName);
      console.log("   Mode:", detection.type);

      // Track this artwork - ignore new detections of it until it's out of frame
      currentArtworkRef.current = artworkName;
      console.log("🔒 Locked onto artwork:", artworkName);

      // Check database for pre-loaded artwork
      console.log("🔎 Checking database for:", artworkName);
      const cached = await getCachedAnalysis(artworkName);

      if (cached) {
        console.log("✅ Found in database, displaying stored analysis");
        setPreviewFromCached(cached, detection.type);
      } else {
        console.log("❌ Artwork not found in database");
        // Show "not found" message
        setLatestResult({
          title: artworkName,
          artist: "Unknown",
          description:
            "This artwork is not in our database yet. Please scan a different artwork.",
          historicalPrompt: "",
          immersivePrompt: "",
          audioUri: null,
          type: detection.type,
          mode: detection.type,
        });
      }

      console.log("✅ Analysis complete");
    } catch (error) {
      console.error("❌ Analysis failed:", error);
      if (error instanceof Error) {
        console.error("   Error message:", error.message);
      }
      setLatestResult({
        title: "Error",
        artist: "Unknown",
        description: "Failed to check database. Please try again.",
        historicalPrompt: "",
        immersivePrompt: "",
        audioUri: null,
        type: detection.type,
        mode: detection.type,
      });
    } finally {
      setIsAnalyzing(false);
      analyzingRef.current = false;
      setDetections((prev) =>
        prev.map((d) =>
          d.timestamp === detection.timestamp ? { ...d, analyzing: false } : d,
        ),
      );
    }
  };

  const handleStart = async () => {
    console.log("🚀 START BUTTON CLICKED");
    console.log("   API Key exists:", !!apiKey);
    console.log("   API Key length:", apiKey?.length);
    console.log("   Is initialized:", isInitialized);

    // Start our own camera stream for display
    try {
      console.log("📹 Requesting camera access for display...");
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "environment",
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        console.log("✅ Camera display active");
      }
    } catch (error) {
      console.error("❌ Camera access failed:", error);
      alert("Failed to access camera. Please grant camera permissions.");
      return;
    }

    // Initialize Overshoot (it will create its own internal camera stream for processing)
    if (!isInitialized) {
      console.log(
        "🔧 Initializing Overshoot with API key:",
        apiKey.substring(0, 10) + "...",
      );
      const success = await initialize({
        apiKey,
        onArtworkDetected: handleArtworkDetected,
        onResult: (result) => {
          console.log("📡 Overshoot result:", result.result);

          // Extract and display guidance
          try {
            const parsed = JSON.parse(result.result);
            if (parsed.hasArtwork) {
              if (parsed.position === "left") {
                setGuidanceMessage("👉 Turn RIGHT to center the artwork");
              } else if (parsed.position === "right") {
                setGuidanceMessage("👈 Turn LEFT to center the artwork");
              } else if (parsed.position === "partial") {
                setGuidanceMessage(
                  "⚠️ Move back - artwork is partially visible",
                );
              } else if (parsed.position === "center") {
                setGuidanceMessage("✅ Perfect! Artwork is centered");
              }
            } else {
              // No artwork detected - clear the locked artwork if we have one
              if (currentArtworkRef.current) {
                console.log(
                  "🔓 Artwork out of frame, ready for new detection:",
                  currentArtworkRef.current,
                );
                currentArtworkRef.current = null;
              }
              setGuidanceMessage("👀 Look around - no artwork detected");
            }
          } catch (e) {
            // Non-JSON response, clear guidance
            setGuidanceMessage("");
          }
        },
      });

      if (!success) {
        alert("Failed to initialize Overshoot. Please check your API key.");
        return;
      }
    }

    console.log("▶️ Starting Overshoot vision...");
    await start();
    setIsActive(true);
  };
  const handleStop = async () => {
    console.log("🛑 Stop button clicked");
    if (holdTimeoutRef.current) {
      clearTimeout(holdTimeoutRef.current);
      holdTimeoutRef.current = null;
      pendingDetectionRef.current = null;
      setHoldMessage("");
    }
    currentArtworkRef.current = null; // Clear locked artwork
    await stop();
    setIsActive(false);

    // Stop our display camera stream
    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((track) => {
        console.log("   Stopping camera track:", track.label);
        track.stop();
      });
      videoRef.current.srcObject = null;
      console.log("✅ Camera display stopped");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-gray-100 to-gray-200">
      <header className="border-b border-gray-300 bg-white/80 backdrop-blur-md shadow-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-display text-gray-900 tracking-tight">
                Real-Time Detection
              </h1>
              <p className="text-gray-600 text-sm mt-0.5 font-body tracking-normal">
                Point your camera at artwork for instant AI analysis
              </p>
            </div>
            <button
              onClick={() => router.push("/")}
              className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-gray-200 hover:bg-gray-300 text-gray-900 transition-all duration-300 font-medium border border-gray-400"
            >
              <Home className="w-5 h-5" />
              Home
            </button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-7xl">
        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <div className="bg-white/60 backdrop-blur-md rounded-2xl p-6 mb-4 border-2 border-gray-300 shadow-lg">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-gray-900 font-display text-xl tracking-tight flex items-center gap-2">
                  <Camera className="w-5 h-5" />
                  Live Camera Feed
                </h2>
                <div
                  className={`px-4 py-2 rounded-full text-sm font-medium flex items-center gap-2 ${
                    isActive
                      ? "bg-gray-900 text-white"
                      : "bg-gray-300 text-gray-600"
                  }`}
                >
                  {isAnalyzing && <Loader2 className="w-3 h-3 animate-spin" />}
                  {isActive
                    ? isAnalyzing
                      ? "Analyzing..."
                      : "Scanning"
                    : "Inactive"}
                </div>
              </div>

              <div
                className="relative w-full rounded-xl overflow-hidden bg-gray-200 border-2 border-gray-300"
                style={{
                  height: "calc(100vh - 280px)",
                  minHeight: "400px",
                  maxHeight: "720px",
                }}
              >
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />

                {holdMessage && (
                  <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-amber-900/90 text-amber-100 px-6 py-2 rounded-full text-sm font-semibold shadow-lg z-20">
                    {holdMessage}
                  </div>
                )}

                {/* Guidance Overlay */}
                {isActive && guidanceMessage && (
                  <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 bg-black/80 text-white px-6 py-3 rounded-full text-lg font-semibold shadow-lg animate-pulse z-10">
                    {guidanceMessage}
                  </div>
                )}

                {!isActive && (
                  <div className="absolute inset-0 flex items-center justify-center bg-gray-100/90 backdrop-blur-sm">
                    <div className="text-center">
                      <Camera className="w-16 h-16 text-gray-400 mx-auto mb-2" />
                      <p className="text-gray-600 font-body">
                        Camera not active
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-3 mt-4">
                <button
                  onClick={isActive ? handleStop : handleStart}
                  disabled={isAnalyzing || !apiKey}
                  className={`w-full py-3 rounded-full font-bold transition-all duration-300 flex items-center justify-center gap-2 ${
                    isActive
                      ? "bg-gray-900 hover:bg-gray-800 text-white disabled:bg-gray-700 disabled:opacity-50"
                      : "bg-gray-900 hover:bg-gray-800 text-white disabled:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
                  }`}
                >
                  {isActive ? (
                    <>
                      <Camera className="w-5 h-5" /> Stop Scanning
                    </>
                  ) : (
                    <>
                      <Camera className="w-5 h-5" /> Start Camera
                    </>
                  )}
                </button>
                {!apiKey && (
                  <p className="text-yellow-500 text-sm text-center">
                    ⚠️ Add NEXT_PUBLIC_OVERSHOOT_API_KEY to .env.local
                  </p>
                )}
              </div>

              <div className="mt-4 bg-gray-100 border border-gray-300 rounded-xl p-4">
                <h3 className="text-gray-900 font-display font-medium mb-2 text-base tracking-tight">
                  📷 How it works
                </h3>
                <ul className="text-gray-700 text-sm space-y-1.5 font-body">
                  <li>• Point camera at artwork, monuments, or landscapes</li>
                  <li>• AI automatically detects and lists items in sidebar</li>
                  <li>• Click any detection to analyze and get full details</li>
                  <li>• Results page opens with complete analysis</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="lg:col-span-1">
            <div
              className="bg-white/70 backdrop-blur-md rounded-2xl p-6 border-2 border-gray-300 shadow-lg flex flex-col gap-4"
              style={{ height: "calc(100vh - 180px)", minHeight: "500px" }}
            >
              <h2 className="text-gray-900 font-display text-xl tracking-tight">
                Live Result Preview
              </h2>

              {latestResult ? (
                <div
                  className="space-y-3 overflow-y-auto pr-1"
                  style={{ height: "calc(100% - 40px)" }}
                >
                  <div className="bg-white border border-gray-200 rounded-xl p-3">
                    <p className="text-xs uppercase text-gray-500 font-semibold mb-1">
                      Title
                    </p>
                    <p className="text-gray-900 font-semibold text-lg leading-tight">
                      {latestResult.title || "Untitled"}
                    </p>
                    <p className="text-sm text-gray-600 mt-1">
                      {latestResult.artist || "Unknown Artist"}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => {
                        const willClose = showHistorical;
                        setShowHistorical((v) => !v);
                        if (!showHistorical) {
                          handleReadText("historical");
                        } else if (
                          willClose &&
                          isTTSPlaying &&
                          ttsType === "historical"
                        ) {
                          // Stop TTS when closing
                          if (ttsAudioRef.current) {
                            ttsAudioRef.current.pause();
                            setIsTTSPlaying(false);
                            setTtsType(null);
                          }
                        }
                      }}
                      className={`w-full py-2.5 rounded-lg border text-sm font-semibold transition-all ${
                        isTTSPlaying && ttsType === "historical"
                          ? "border-blue-500 bg-blue-50 text-blue-900"
                          : "border-gray-300 bg-white hover:border-gray-900 text-gray-900"
                      }`}
                    >
                      {isTTSPlaying && ttsType === "historical"
                        ? "🔊 Playing..."
                        : "Historical Context"}
                    </button>
                    <button
                      onClick={() => {
                        const willClose = showImmersive;
                        setShowImmersive((v) => !v);
                        if (!showImmersive) {
                          handleReadText("immersive");
                        } else if (
                          willClose &&
                          isTTSPlaying &&
                          ttsType === "immersive"
                        ) {
                          // Stop TTS when closing
                          if (ttsAudioRef.current) {
                            ttsAudioRef.current.pause();
                            setIsTTSPlaying(false);
                            setTtsType(null);
                          }
                        }
                      }}
                      className={`w-full py-2.5 rounded-lg border text-sm font-semibold transition-all ${
                        isTTSPlaying && ttsType === "immersive"
                          ? "border-blue-500 bg-blue-50 text-blue-900"
                          : "border-gray-300 bg-white hover:border-gray-900 text-gray-900"
                      }`}
                    >
                      {isTTSPlaying && ttsType === "immersive"
                        ? "🔊 Playing..."
                        : "Immersive Context"}
                    </button>
                  </div>

                  {showHistorical && (
                    <div className="bg-white border border-gray-200 rounded-xl p-3">
                      <p className="text-xs uppercase text-gray-500 font-semibold mb-1">
                        Historical
                      </p>
                      <p className="text-sm text-gray-800 whitespace-pre-line">
                        {latestResult.historicalPrompt ||
                          latestResult.description ||
                          "No historical context yet."}
                      </p>
                    </div>
                  )}

                  {showImmersive && (
                    <div className="bg-white border border-gray-200 rounded-xl p-3">
                      <p className="text-xs uppercase text-gray-500 font-semibold mb-1">
                        Immersive
                      </p>
                      <p className="text-sm text-gray-800 whitespace-pre-line">
                        {latestResult.immersivePrompt ||
                          "No immersive context yet."}
                      </p>
                    </div>
                  )}

                  <div className="bg-white border border-gray-200 rounded-xl p-3 flex items-center justify-between">
                    <div>
                      <p className="text-xs uppercase text-gray-500 font-semibold">
                        Music
                      </p>
                      <p className="text-sm text-gray-700">
                        {latestResult.audioUri
                          ? "Generated track"
                          : "Not available"}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={handlePlayMusic}
                        disabled={!latestResult.audioUri}
                        className="px-3 py-2 rounded-lg border border-gray-300 bg-white hover:border-gray-900 text-gray-900 text-sm font-semibold disabled:opacity-50"
                      >
                        Play
                      </button>
                      <button
                        onClick={handleStopMusic}
                        className="px-3 py-2 rounded-lg border border-gray-300 bg-white hover:border-gray-900 text-gray-900 text-sm font-semibold"
                      >
                        Stop
                      </button>
                    </div>
                  </div>

                  <div className="bg-gray-900 text-white rounded-xl p-3">
                    <p className="text-xs uppercase text-gray-300 font-semibold mb-1">
                      Summary
                    </p>
                    <p className="text-sm text-gray-100 line-clamp-5">
                      {latestResult.description || "No description yet."}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-center text-gray-600">
                  <Camera className="w-12 h-12 text-gray-400 mb-3" />
                  <p className="text-sm font-medium">No analysis yet</p>
                  <p className="text-xs">Scan artwork to see results here.</p>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="mt-4 bg-blue-900/20 border border-blue-500/30 rounded-xl p-4">
          <h3 className="text-blue-300 font-semibold mb-1.5 text-sm">
            🚀 Powered by Overshoot Real-Time Vision
          </h3>
          <p className="text-gray-300 text-xs">
            This feature uses Overshoot&apos;s real-time vision AI to
            continuously scan your camera feed for artwork, monuments, and
            landscapes. When detected, the full analysis pipeline runs
            automatically, providing historical context, descriptions, and audio
            narration. Detection happens in milliseconds with high accuracy.
          </p>
        </div>
      </main>
    </div>
  );
}
