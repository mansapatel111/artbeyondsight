"use client";

import { Camera, Home, Sparkles, Upload } from "lucide-react";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import { useRef, useState } from "react";

type Mode = "museum" | "monuments" | "landscape";

export default function ScanPage() {
  const router = useRouter();
  const params = useParams();
  const mode = (params.mode as Mode) || "museum";

  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressMessage, setProgressMessage] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);

  const modeConfig = {
    museum: {
      color: "bg-museum",
      hoverColor: "hover:bg-blue-600",
      borderColor: "border-museum",
      textColor: "text-museum",
    },
    monuments: {
      color: "bg-monuments",
      hoverColor: "hover:bg-amber-800",
      borderColor: "border-monuments",
      textColor: "text-monuments",
    },
    landscape: {
      color: "bg-landscape",
      hoverColor: "hover:bg-green-700",
      borderColor: "border-landscape",
      textColor: "text-landscape",
    },
  };

  const config = modeConfig[mode];

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setIsCameraActive(true);
      }
    } catch (error) {
      console.error("Error accessing camera:", error);
      alert("Could not access camera. Please check permissions.");
    }
  };

  const capturePhoto = () => {
    if (videoRef.current) {
      const canvas = document.createElement("canvas");
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(videoRef.current, 0, 0);
        canvas.toBlob((blob) => {
          if (blob) {
            setImagePreview(canvas.toDataURL("image/jpeg"));
            stopCamera();
          }
        }, "image/jpeg");
      }
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((track) => track.stop());
      setIsCameraActive(false);
    }
  };

  const handleAnalyze = async () => {
    if (!imagePreview) return;

    try {
      setIsProcessing(true);
      setProgressMessage(
        "This feature has been disabled. Please use Real-Time Detection instead.",
      );

      await new Promise((resolve) => setTimeout(resolve, 2000));

      alert(
        "Static image analysis has been disabled. Please use the Real-Time Detection feature to scan artwork from the database.",
      );
    } catch (error) {
      console.error("Error:", error);
      alert("Please use Real-Time Detection instead.");
    } finally {
      setIsProcessing(false);
      setProgressMessage("");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black">
      {/* Header */}
      <header className="border-b border-gray-700 bg-gray-900/50 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-6">
          <h1 className="text-2xl font-bold text-white">
            {mode.charAt(0).toUpperCase() + mode.slice(1)} Mode
          </h1>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Image Preview or Placeholder */}
        <div className="mb-8">
          {imagePreview ? (
            <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-gray-800">
              <Image
                src={imagePreview}
                alt="Selected image"
                fill
                className="object-contain"
              />
            </div>
          ) : isCameraActive ? (
            <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-black">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                className="w-full h-full object-cover"
              />
              <button
                onClick={capturePhoto}
                className={`absolute bottom-4 left-1/2 -translate-x-1/2 w-16 h-16 rounded-full ${config.color} border-4 border-white shadow-lg`}
                aria-label="Capture photo"
              />
            </div>
          ) : (
            <div
              className={`w-full aspect-video rounded-xl border-2 border-dashed ${config.borderColor} bg-gray-800/50 flex flex-col items-center justify-center text-center p-8`}
            >
              <Camera className={`w-20 h-20 ${config.textColor} mb-4`} />
              <p className="text-white text-xl font-semibold mb-2">
                No image selected
              </p>
              <p className="text-gray-400">
                {mode === "museum"
                  ? "Select a painting or artwork"
                  : mode === "monuments"
                    ? "Select a monument or landmark"
                    : "Select a landscape or nature scene"}
              </p>
            </div>
          )}
        </div>

        {/* Loading Overlay */}
        {isProcessing && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-gray-800 rounded-2xl p-8 max-w-md mx-4 text-center">
              <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-white mx-auto mb-6" />
              <h3 className="text-white text-2xl font-bold mb-2">
                {mode === "museum"
                  ? "Analyzing Artwork"
                  : mode === "monuments"
                    ? "Analyzing Monument"
                    : "Analyzing Landscape"}
              </h3>
              {progressMessage && (
                <p className="text-gray-300 mb-2">{progressMessage}</p>
              )}
              {mode === "museum" && progressMessage.includes("music") && (
                <p className="text-gray-400 text-sm">
                  Generating unique music based on the artwork&apos;s mood...
                </p>
              )}
            </div>
          </div>
        )}

        {/* Controls */}
        <div className="flex flex-wrap gap-4 justify-center mb-8">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileSelect}
            className="hidden"
          />

          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isProcessing || isCameraActive}
            className={`flex items-center gap-2 px-6 py-3 rounded-lg bg-gray-700 text-white ${isProcessing || isCameraActive ? "opacity-50 cursor-not-allowed" : "hover:bg-gray-600"} transition-colors`}
          >
            <Upload className="w-5 h-5" />
            Upload Image
          </button>

          <button
            onClick={isCameraActive ? stopCamera : startCamera}
            disabled={isProcessing}
            className={`flex items-center gap-2 px-6 py-3 rounded-lg bg-gray-700 text-white ${isProcessing ? "opacity-50 cursor-not-allowed" : "hover:bg-gray-600"} transition-colors`}
          >
            <Camera className="w-5 h-5" />
            {isCameraActive ? "Stop Camera" : "Use Camera"}
          </button>

          <button
            onClick={() => router.push("/")}
            disabled={isProcessing}
            className={`flex items-center gap-2 px-6 py-3 rounded-lg bg-gray-700 text-white ${isProcessing ? "opacity-50 cursor-not-allowed" : "hover:bg-gray-600"} transition-colors`}
          >
            <Home className="w-5 h-5" />
            Home
          </button>
        </div>

        {/* Analyze Button */}
        {imagePreview && !isProcessing && (
          <div className="text-center">
            <button
              onClick={handleAnalyze}
              className={`inline-flex items-center gap-2 px-8 py-4 rounded-lg ${config.color} ${config.hoverColor} text-white font-semibold text-lg shadow-lg hover:shadow-xl transition-all transform hover:scale-105`}
            >
              <Sparkles className="w-6 h-6" />
              Analyze Image
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
