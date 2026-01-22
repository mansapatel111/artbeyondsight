"use client";

import { Camera, Home, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useOvershootVision } from "../../components/OvershootVision";
import { analyzeImage } from "../../lib/analyzeImage";
import { ArtBeyondSightAPI } from "../../lib/api";

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
  const [holdMessage, setHoldMessage] = useState<string>("");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const holdTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingDetectionRef = useRef<Detection | null>(null);
  const { initialize, start, stop, isInitialized } = useOvershootVision();

  const apiKey = process.env.NEXT_PUBLIC_OVERSHOOT_API_KEY || "";
  const lastDetectionRef = useRef<string>("");
  const analyzingRef = useRef(false);

  const captureFrame = (): string | null => {
    if (!videoRef.current) return null;

    const canvas = document.createElement("canvas");
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.drawImage(videoRef.current, 0, 0);
    return canvas.toDataURL("image/jpeg", 0.8);
  };

  const handleArtworkDetected = (detection: {
    type: "museum" | "monuments" | "landscape";
    confidence: number;
    description: string;
    title?: string;
  }) => {
    console.log("🎨 Artwork detected!", detection);

    if (analyzingRef.current) {
      console.log("⏳ Analysis in flight, ignoring new detection");
      return;
    }

    if (holdTimeoutRef.current) {
      console.log("⏸️ Already holding for a detection, skipping new one");
      return;
    }

    const detectionKey = `${detection.type}-${detection.description.slice(0, 50)}`;
    if (lastDetectionRef.current === detectionKey) {
      return;
    }

    lastDetectionRef.current = detectionKey;
    setTimeout(() => {
      lastDetectionRef.current = "";
    }, 5000);

    const newDetection: Detection = {
      timestamp: new Date().toLocaleTimeString(),
      ...detection,
      analyzing: false,
    };

    pendingDetectionRef.current = newDetection;

    const displayTitle = detection.title?.trim() || extractArtworkName(detection.description);
    const displayArtist = "Unknown artist";
    setHoldMessage(
      `Detected "${displayTitle}" by ${displayArtist} — please hold still for 5 seconds while we lock focus.`,
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
    }, 5000);

    setDetections((prev) => [newDetection, ...prev.slice(0, 9)]);
  };

  const normalize = (value: string) => value.trim().toLowerCase();

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

  const buildResultFromCached = (
    cached: NonNullable<Awaited<ReturnType<typeof pickCachedMatch>>>,
    fallbackImageDataUrl: string,
    mode: Detection["type"],
  ) => {
    const [historicalPrompt = "", immersivePrompt = ""] =
      cached.descriptions || [];
    return {
      imageUri:
        cached.metadata?.imageUri || cached.image_url || fallbackImageDataUrl,
      title: cached.image_name,
      artist: cached.metadata?.artist || "Unknown Artist",
      type: cached.analysis_type || mode,
      description:
        cached.metadata?.historicalPrompt || historicalPrompt || "Description",
      historicalPrompt,
      immersivePrompt,
      emotions: cached.metadata?.emotions || ["curious", "engaged"],
      audioUri: cached.metadata?.audioUri || null,
      mode,
      isEnriching: false,
    } as const;
  };

  const setPreviewFromCached = (
    cached: NonNullable<Awaited<ReturnType<typeof pickCachedMatch>>>,
    fallbackImageDataUrl: string,
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
  };

  const setPreviewFromAnalysis = (
    analysis: Awaited<ReturnType<typeof analyzeImage>>,
    mode: Detection["type"],
  ) => {
    setLatestResult({
      title: analysis.title,
      artist: analysis.artist,
      description: analysis.description,
      historicalPrompt: analysis.historicalPrompt,
      immersivePrompt: analysis.immersivePrompt,
      audioUri: analysis.audioUri,
      type: analysis.type,
      mode,
    });
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

  const handleAnalyzeDetection = async (detection: Detection) => {
    if (analyzingRef.current) {
      console.log("⚠️ Analysis already in progress, skipping...");
      return;
    }

    analyzingRef.current = true;
    setIsAnalyzing(true);
    setDetections((prev) =>
      prev.map((d) =>
        d.timestamp === detection.timestamp ? { ...d, analyzing: true } : d,
      ),
    );

    try {
      console.log("📸 Step 1: Capturing frame from video...");
      const imageDataUrl = captureFrame();
      if (!imageDataUrl) {
        throw new Error(
          "Failed to capture frame - video element may not be ready",
        );
      }
      console.log(
        "✅ Frame captured successfully, size:",
        imageDataUrl.length,
        "chars",
      );

      const overshootTitle = detection.title?.trim();

      if (overshootTitle) {
        console.log("🔎 Checking cache for title:", overshootTitle);
        const cached = await getCachedAnalysis(overshootTitle);
        if (cached) {
          console.log("✅ Cache hit, using stored analysis");
          setPreviewFromCached(cached, imageDataUrl, detection.type);
          setIsAnalyzing(false);
          analyzingRef.current = false;
          setDetections((prev) =>
            prev.map((d) =>
              d.timestamp === detection.timestamp
                ? { ...d, analyzing: false }
                : d,
            ),
          );
          return;
        }
        console.log("ℹ️ Cache miss, falling back to Navigator pipeline");
      }

      // Stop Overshoot stream before heavy processing
      console.log("⏸️ Pausing Overshoot stream during analysis...");
      try {
        await stop();
        console.log("✅ Overshoot paused");
      } catch (stopError) {
        console.warn("⚠️ Could not pause Overshoot:", stopError);
        // Continue anyway
      }

      console.log("🔍 Step 2: Processing Overshoot detection...");
      console.log("   Mode:", detection.type);
      console.log("   Description:", detection.description);

      // Extract artwork name from Overshoot description
      // e.g., "A person holding a smartphone displaying an image of the Mona Lisa painting" → "Mona Lisa"
      const artworkName = extractArtworkName(detection.description);
      console.log("   Extracted artwork name:", artworkName);

      // Show initial fast preview
      setLatestResult({
        title: artworkName,
        artist: "Loading...",
        description: detection.description,
        historicalPrompt: "Loading historical context...",
        immersivePrompt: "Loading immersive experience...",
        audioUri: null,
        type: detection.type,
        mode: detection.type,
      });

      // Background enrichment: Get detailed context and generate music
      console.log("🎨 Starting enrichment (Navigator + Suno)...");
      try {
        const enrichedAnalysis = await analyzeImage(
          imageDataUrl,
          detection.type,
          overshootTitle
            ? `${overshootTitle} — ${detection.description}`
            : detection.description,
        );

        setPreviewFromAnalysis(enrichedAnalysis, detection.type);
        console.log("✅ Enrichment complete");
      } catch (enrichmentError) {
        console.error(
          "⚠️ Enrichment failed (non-fatal):",
          enrichmentError,
        );
        // Keep the initial fast data - user already has something to see
      }
    } catch (error) {
      console.error("❌ Analysis pipeline failed:", error);
      if (error instanceof Error) {
        console.error("   Error name:", error.name);
        console.error("   Error message:", error.message);
        console.error("   Stack:", error.stack);
      }
      alert(
        `Failed to analyze artwork: ${error instanceof Error ? error.message : "Unknown error"}\n\nCheck console for details.`,
      );
      setDetections((prev) =>
        prev.map((d) =>
          d.timestamp === detection.timestamp ? { ...d, analyzing: false } : d,
        ),
      );

      // Restart Overshoot
      console.log("🔄 Restarting Overshoot after error...");
      try {
        await start();
      } catch (restartError) {
        console.error("❌ Could not restart Overshoot:", restartError);
      }
    } finally {
      setIsAnalyzing(false);
      analyzingRef.current = false;
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
                setGuidanceMessage("⚠️ Move back - artwork is partially visible");
              } else if (parsed.position === "center") {
                setGuidanceMessage("✅ Perfect! Artwork is centered");
              }
            } else {
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
                  className={`px-4 py-2 rounded-full text-sm font-medium flex items-center gap-2 ${isActive
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
                  className={`w-full py-3 rounded-full font-bold transition-all duration-300 flex items-center justify-center gap-2 ${isActive
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
                <div className="space-y-3 overflow-y-auto pr-1" style={{ height: "calc(100% - 40px)" }}>
                  <div className="bg-white border border-gray-200 rounded-xl p-3">
                    <p className="text-xs uppercase text-gray-500 font-semibold mb-1">
                      Title
                    </p>
                    <p className="text-gray-900 font-semibold text-lg leading-tight">
                      {latestResult.title || "Untitled"}
                    </p>
                    <p className="text-sm text-gray-600 mt-1">{latestResult.artist || "Unknown Artist"}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setShowHistorical((v) => !v)}
                      className="w-full py-2.5 rounded-lg border border-gray-300 bg-white hover:border-gray-900 text-gray-900 text-sm font-semibold transition-all"
                    >
                      Historical Context
                    </button>
                    <button
                      onClick={() => setShowImmersive((v) => !v)}
                      className="w-full py-2.5 rounded-lg border border-gray-300 bg-white hover:border-gray-900 text-gray-900 text-sm font-semibold transition-all"
                    >
                      Immersive Context
                    </button>
                  </div>

                  {showHistorical && (
                    <div className="bg-white border border-gray-200 rounded-xl p-3">
                      <p className="text-xs uppercase text-gray-500 font-semibold mb-1">
                        Historical
                      </p>
                      <p className="text-sm text-gray-800 whitespace-pre-line">
                        {latestResult.historicalPrompt || latestResult.description || "No historical context yet."}
                      </p>
                    </div>
                  )}

                  {showImmersive && (
                    <div className="bg-white border border-gray-200 rounded-xl p-3">
                      <p className="text-xs uppercase text-gray-500 font-semibold mb-1">
                        Immersive
                      </p>
                      <p className="text-sm text-gray-800 whitespace-pre-line">
                        {latestResult.immersivePrompt || "No immersive context yet."}
                      </p>
                    </div>
                  )}

                  <div className="bg-white border border-gray-200 rounded-xl p-3 flex items-center justify-between">
                    <div>
                      <p className="text-xs uppercase text-gray-500 font-semibold">Music</p>
                      <p className="text-sm text-gray-700">
                        {latestResult.audioUri ? "Generated track" : "Not available"}
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
