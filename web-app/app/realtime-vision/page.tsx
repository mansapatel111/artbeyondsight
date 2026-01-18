"use client";

import { Camera, Home, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useOvershootVision } from "../../components/OvershootVision";
import { analyzeImage } from "../../lib/analyzeImage";

interface Detection {
  timestamp: string;
  type: "museum" | "monuments" | "landscape";
  confidence: number;
  description: string;
  analyzing?: boolean;
}

export default function RealtimeVisionPage() {
  const router = useRouter();
  const [detections, setDetections] = useState<Detection[]>([]);
  const [isActive, setIsActive] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
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
  }) => {
    console.log("🎨 Artwork detected!", detection);
    const detectionKey = `${detection.type}-${detection.description.slice(0, 50)}`;

    // Skip duplicate detections within 5 seconds
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

    setDetections((prev) => [newDetection, ...prev.slice(0, 9)]);
  };

  const handleAnalyzeDetection = async (detection: Detection) => {
    if (analyzingRef.current) {
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
        throw new Error("Failed to capture frame");
      }
      console.log("✅ Frame captured successfully");

      // Stop Overshoot stream before heavy processing
      console.log("⏸️ Pausing Overshoot stream during analysis...");
      await stop();

      console.log("🔍 Step 2: Starting AI analysis pipeline...");
      const analysis = await analyzeImage(imageDataUrl, detection.type);
      console.log("✅ Analysis complete:", analysis.title);

      console.log("🚀 Step 3: Navigating to results page...");
      // Store data in sessionStorage to avoid HTTP 431 error (URL too large)
      const resultId = `result-${Date.now()}`;
      sessionStorage.setItem(
        resultId,
        JSON.stringify({
          imageUri: imageDataUrl,
          title: analysis.title,
          artist: analysis.artist,
          type: analysis.type,
          description: analysis.description,
          historicalPrompt: analysis.historicalPrompt || "",
          immersivePrompt: analysis.immersivePrompt || "",
          emotions: analysis.emotions,
          audioUri: analysis.audioUri || "",
          mode: detection.type,
        }),
      );

      router.push(`/result?id=${resultId}`);
    } catch (error) {
      console.error("❌ Analysis pipeline failed:", error);
      if (error instanceof Error) {
        console.error("   Error message:", error.message);
        console.error("   Stack:", error.stack);
      }
      alert(
        `Failed to analyze artwork: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
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
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black">
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

      <main className="container mx-auto px-4 py-6 max-w-7xl">
        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <div className="bg-gray-800 rounded-xl p-4 mb-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-white font-semibold flex items-center gap-2">
                  <Camera className="w-5 h-5" />
                  Live Camera Feed
                </h2>
                <div
                  className={`px-3 py-1 rounded-full text-sm font-medium flex items-center gap-2 ${
                    isActive
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

              <div
                className="relative w-full rounded-lg overflow-hidden bg-black"
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
                {!isActive && (
                  <div className="absolute inset-0 flex items-center justify-center bg-gray-900/50">
                    <div className="text-center">
                      <Camera className="w-16 h-16 text-gray-500 mx-auto mb-2" />
                      <p className="text-gray-400">Camera not active</p>
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-3 mt-4">
                <button
                  onClick={isActive ? handleStop : handleStart}
                  disabled={isAnalyzing || !apiKey}
                  className={`w-full py-3 rounded-lg font-semibold transition-colors flex items-center justify-center gap-2 ${
                    isActive
                      ? "bg-red-500 hover:bg-red-600 text-white disabled:bg-red-400"
                      : "bg-green-500 hover:bg-green-600 text-white disabled:bg-green-400 disabled:cursor-not-allowed"
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

              <div className="mt-4 bg-blue-900/20 border border-blue-500/30 rounded-lg p-3">
                <h3 className="text-blue-300 font-semibold mb-2 text-sm">
                  📷 How it works
                </h3>
                <ul className="text-gray-300 text-xs space-y-1">
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
              className="bg-gray-800 rounded-xl p-4"
              style={{ height: "calc(100vh - 180px)", minHeight: "500px" }}
            >
              <h2 className="text-white font-semibold mb-3 text-sm">
                Recent Detections
              </h2>

              <div
                className="space-y-2 overflow-y-auto"
                style={{ height: "calc(100% - 40px)" }}
              >
                {detections.length === 0 ? (
                  <div className="text-center py-8">
                    <Camera className="w-12 h-12 text-gray-600 mx-auto mb-2" />
                    <p className="text-gray-500 font-medium mb-1 text-sm">
                      {isActive
                        ? "Scanning for artwork..."
                        : "Start the camera to detect artwork"}
                    </p>
                    <p className="text-gray-600 text-xs">
                      Point at paintings, sculptures, monuments, or landscapes
                    </p>
                  </div>
                ) : (
                  detections.map((detection, idx) => (
                    <button
                      key={idx}
                      onClick={() =>
                        !detection.analyzing &&
                        handleAnalyzeDetection(detection)
                      }
                      disabled={detection.analyzing || isAnalyzing}
                      className={`w-full bg-gray-900 rounded-lg p-3 border text-left transition-all ${
                        detection.analyzing
                          ? "border-blue-500 animate-pulse cursor-wait"
                          : isAnalyzing
                            ? "border-gray-700 opacity-50 cursor-not-allowed"
                            : "border-gray-700 hover:border-blue-500 hover:bg-gray-800 cursor-pointer"
                      }`}
                    >
                      <div className="flex items-start justify-between mb-1.5">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                              detection.type === "museum"
                                ? "bg-purple-500/20 text-purple-300"
                                : detection.type === "monuments"
                                  ? "bg-amber-500/20 text-amber-300"
                                  : "bg-green-500/20 text-green-300"
                            }`}
                          >
                            {detection.type === "museum"
                              ? "🎨 Art"
                              : detection.type === "monuments"
                                ? "🏛️ Mon"
                                : "🌄 Land"}
                          </span>
                          <span className="text-gray-400 text-xs">
                            {detection.confidence}%
                          </span>
                        </div>
                        <span className="text-gray-500 text-xs">
                          {detection.timestamp}
                        </span>
                      </div>
                      <p className="text-gray-300 text-xs mb-1.5 line-clamp-2">
                        {detection.description}
                      </p>
                      {detection.analyzing && (
                        <div className="flex items-center gap-1.5 text-blue-400 text-xs">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          Analyzing...
                        </div>
                      )}
                    </button>
                  ))
                )}
              </div>
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
