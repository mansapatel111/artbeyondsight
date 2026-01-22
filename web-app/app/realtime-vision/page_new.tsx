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

  const normalize = (value: string) => value.trim().toLowerCase();

  const getCachedAnalysis = async (paintingName?: string) => {
    if (!paintingName) return null;
    try {
      const analyses = await ArtBeyondSightAPI.searchAnalysesByName(
        paintingName,
      );
      const target = normalize(paintingName);
      return (
        analyses.find((a) => normalize(a.image_name) === target) ||
        analyses.find((a) => normalize(a.image_name).includes(target)) ||
        analyses.find((a) => target.includes(normalize(a.image_name))) ||
        null
      );
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

  const buildParamsFromCached = (
    cached: NonNullable<Awaited<ReturnType<typeof getCachedAnalysis>>>,
    fallbackImageDataUrl: string,
    mode: Detection["type"],
  ) => {
    const [historicalPrompt = "", immersivePrompt = ""] =
      cached.descriptions || [];
    return new URLSearchParams({
      imageUri:
        cached.metadata?.imageUri || cached.image_url || fallbackImageDataUrl,
      title: cached.image_name,
      artist: cached.metadata?.artist || "Unknown Artist",
      type: cached.analysis_type || mode,
      description:
        cached.metadata?.historicalPrompt || historicalPrompt || "Description",
      historicalPrompt,
      immersivePrompt,
      emotions: JSON.stringify(cached.metadata?.emotions || ["curious", "engaged"]),
      audioUri: cached.metadata?.audioUri || "",
      mode,
    });
  };

  const setPreviewFromCached = (
    cached: NonNullable<Awaited<ReturnType<typeof getCachedAnalysis>>>,
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
      const imageDataUrl = captureFrame();
      if (!imageDataUrl) {
        throw new Error("Failed to capture frame");
      }

      const overshootTitle = detection.title?.trim();

      if (overshootTitle) {
        console.log("🔎 Checking cache for title:", overshootTitle);
        const cached = await getCachedAnalysis(overshootTitle);
        if (cached) {
          console.log("✅ Cache hit, using stored analysis");
          setPreviewFromCached(cached, imageDataUrl, detection.type);
          setDetections((prev) =>
            prev.map((d) =>
              d.timestamp === detection.timestamp
                ? { ...d, analyzing: false }
                : d,
            ),
          );
          setIsAnalyzing(false);
          analyzingRef.current = false;
          return;
        }
        console.log("ℹ️ Cache miss, falling back to Navigator pipeline");
      }

      const analysis = await analyzeImage(
        imageDataUrl,
        detection.type,
        overshootTitle
          ? `${overshootTitle} — ${detection.description}`
          : detection.description,
      );

      setPreviewFromAnalysis(analysis, detection.type);
      console.log("✅ Analysis complete, showing in preview panel");
    } catch (error) {
      console.error("Analysis failed:", error);
      alert("Failed to analyze artwork. Please try again.");
      setDetections((prev) =>
        prev.map((d) =>
          d.timestamp === detection.timestamp ? { ...d, analyzing: false } : d,
        ),
      );
    } finally {
      setIsAnalyzing(false);
      analyzingRef.current = false;
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

  const handleArtworkDetected = (detection: {
    type: "museum" | "monuments" | "landscape";
    confidence: number;
    description: string;
    title?: string;
  }) => {
    if (analyzingRef.current) {
      console.log("⏳ Analysis already running, ignoring detection");
      return;
    }

    if (holdTimeoutRef.current) {
      console.log("⏸️ Already holding a detection, skipping new one");
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
      if (!pending) return;
      setHoldMessage("Processing... please wait");
      await handleAnalyzeDetection(pending);
      setHoldMessage("");
      pendingDetectionRef.current = null;
    }, 5000);

    setDetections((prev) => [newDetection, ...prev.slice(0, 9)]);
  };

  const handleStart = async () => {
    if (!isInitialized) {
      const success = await initialize({
        apiKey,
        onArtworkDetected: handleArtworkDetected,
        onResult: (result) => {
          console.log("Overshoot scanning:", result.result);

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

    // Start camera
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (error) {
      console.error("Camera access failed:", error);
      alert("Failed to access camera. Please grant camera permissions.");
      return;
    }

    await start();
    setIsActive(true);
  };

  const handleStop = async () => {
    if (holdTimeoutRef.current) {
      clearTimeout(holdTimeoutRef.current);
      holdTimeoutRef.current = null;
      pendingDetectionRef.current = null;
      setHoldMessage("");
    }
    await stop();
    setIsActive(false);

    // Stop camera stream
    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black">
      {/* Header */}
      <header className="border-b border-gray-700 bg-gray-900/50 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-white">
                Real-Time Artwork Detection
              </h1>
              <p className="text-gray-400 text-sm mt-1">
                Point your camera at artwork for instant AI analysis
              </p>
            </div>
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

      <main className="container mx-auto px-4 py-8 max-w-6xl">
        <div className="grid lg:grid-cols-2 gap-8">
          {/* Camera Feed */}
          <div>
            <div className="bg-gray-800 rounded-xl p-4 mb-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-white font-semibold flex items-center gap-2">
                  <Camera className="w-5 h-5" />
                  Live Camera Feed
                </h2>
                <div
                  className={`px-3 py-1 rounded-full text-sm font-medium flex items-center gap-2 ${isActive
                    ? "bg-green-500/20 text-green-300"
                    : "bg-gray-700 text-gray-400"
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

              <div className="relative aspect-video bg-black rounded-lg overflow-hidden">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />

                {holdMessage && (
                  <div className="absolute top-3 left-1/2 transform -translate-x-1/2 bg-amber-900/90 text-amber-100 px-5 py-2 rounded-full text-xs font-semibold shadow-lg z-20">
                    {holdMessage}
                  </div>
                )}

                {/* Guidance Overlay */}
                {isActive && guidanceMessage && (
                  <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-black/80 text-white px-6 py-3 rounded-full text-sm font-semibold shadow-lg animate-pulse z-10">
                    {guidanceMessage}
                  </div>
                )}

                {!isActive && (
                  <div className="absolute inset-0 flex items-center justify-center bg-gray-900/50">
                    <div className="text-center">
                      <Camera className="w-16 h-16 text-gray-500 mx-auto mb-2" />
                      <p className="text-gray-400">Camera not active</p>
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-4 mt-4">
                <button
                  onClick={isActive ? handleStop : handleStart}
                  disabled={isAnalyzing}
                  className={`w-full py-4 rounded-lg font-semibold transition-colors flex items-center justify-center gap-2 ${isActive
                    ? "bg-red-500 hover:bg-red-600 text-white disabled:bg-red-400"
                    : "bg-green-500 hover:bg-green-600 text-white disabled:bg-green-400"
                    }`}
                >
                  {isActive ? (
                    <>
                      <Camera className="w-5 h-5" />
                      Stop Scanning
                    </>
                  ) : (
                    <>
                      <Camera className="w-5 h-5" />
                      Start Camera
                    </>
                  )}
                </button>
              </div>

              <div className="mt-6 bg-blue-900/20 border border-blue-500/30 rounded-lg p-4">
                <h3 className="text-blue-300 font-semibold mb-2 text-sm">
                  📷 How it works
                </h3>
                <ul className="text-gray-300 text-sm space-y-1">
                  <li>• Point camera at artwork, monuments, or landscapes</li>
                  <li>• AI automatically detects and identifies art type</li>
                  <li>• Full analysis begins when artwork is detected</li>
                  <li>• Results open automatically with complete details</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Live Result Preview Panel */}
          <div>
            <div className="bg-gray-800 rounded-xl p-4 h-full border border-gray-700 flex flex-col gap-4">
              <h2 className="text-white font-semibold text-lg">Live Result Preview</h2>

              {latestResult ? (
                <div className="space-y-3 overflow-y-auto pr-1" style={{ height: "calc(100% - 32px)" }}>
                  <div className="bg-gray-900 border border-gray-700 rounded-lg p-3">
                    <p className="text-[11px] uppercase text-gray-400 font-semibold mb-1">
                      Title
                    </p>
                    <p className="text-white font-semibold text-lg leading-tight">
                      {latestResult.title || "Untitled"}
                    </p>
                    <p className="text-sm text-gray-400 mt-1">
                      {latestResult.artist || "Unknown Artist"}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setShowHistorical((v) => !v)}
                      className="w-full py-2.5 rounded-lg border border-gray-700 bg-gray-900 hover:border-gray-500 text-white text-sm font-semibold transition-all"
                    >
                      Historical Context
                    </button>
                    <button
                      onClick={() => setShowImmersive((v) => !v)}
                      className="w-full py-2.5 rounded-lg border border-gray-700 bg-gray-900 hover:border-gray-500 text-white text-sm font-semibold transition-all"
                    >
                      Immersive Context
                    </button>
                  </div>

                  {showHistorical && (
                    <div className="bg-gray-900 border border-gray-700 rounded-lg p-3">
                      <p className="text-[11px] uppercase text-gray-400 font-semibold mb-1">
                        Historical
                      </p>
                      <p className="text-sm text-gray-200 whitespace-pre-line">
                        {latestResult.historicalPrompt || latestResult.description || "No historical context yet."}
                      </p>
                    </div>
                  )}

                  {showImmersive && (
                    <div className="bg-gray-900 border border-gray-700 rounded-lg p-3">
                      <p className="text-[11px] uppercase text-gray-400 font-semibold mb-1">
                        Immersive
                      </p>
                      <p className="text-sm text-gray-200 whitespace-pre-line">
                        {latestResult.immersivePrompt || "No immersive context yet."}
                      </p>
                    </div>
                  )}

                  <div className="bg-gray-900 border border-gray-700 rounded-lg p-3 flex items-center justify-between">
                    <div>
                      <p className="text-[11px] uppercase text-gray-400 font-semibold">Music</p>
                      <p className="text-sm text-gray-200">
                        {latestResult.audioUri ? "Generated track" : "Not available"}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={handlePlayMusic}
                        disabled={!latestResult.audioUri}
                        className="px-3 py-2 rounded-lg border border-gray-700 bg-gray-900 hover:border-gray-500 text-white text-sm font-semibold disabled:opacity-50"
                      >
                        Play
                      </button>
                      <button
                        onClick={handleStopMusic}
                        className="px-3 py-2 rounded-lg border border-gray-700 bg-gray-900 hover:border-gray-500 text-white text-sm font-semibold"
                      >
                        Stop
                      </button>
                    </div>
                  </div>

                  <div className="bg-gray-900 text-white rounded-lg p-3">
                    <p className="text-[11px] uppercase text-gray-400 font-semibold mb-1">
                      Summary
                    </p>
                    <p className="text-sm text-gray-100 line-clamp-6">
                      {latestResult.description || "No description yet."}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-center text-gray-500 h-full">
                  <Camera className="w-12 h-12 text-gray-600 mb-3" />
                  <p className="text-sm font-medium">No analysis yet</p>
                  <p className="text-xs">Scan artwork to see results here.</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Info Section */}
        <div className="mt-8 bg-blue-900/20 border border-blue-500/30 rounded-xl p-6">
          <h3 className="text-blue-300 font-semibold mb-2">
            🚀 Powered by Overshoot Real-Time Vision
          </h3>
          <p className="text-gray-300 text-sm">
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
