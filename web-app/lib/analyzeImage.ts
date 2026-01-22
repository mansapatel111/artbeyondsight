// Real-time image analysis using Navigator API and Suno
// This integrates with your existing backend pipeline

import { textToSpeech } from "./elevenlabs";
import { analyzeArtwork, analyzeArtworkByName } from "./navigator";
import { generateMusic } from "./suno";

/**
 * Announce artwork detection via TTS
 */
async function announceDetection(artworkName: string): Promise<void> {
  try {
    console.log("🔊 Announcing detection:", artworkName);
    const message = `${artworkName} found. Please wait a few moments while we gather detailed information.`;
    await textToSpeech(message);
  } catch (error) {
    console.error("Failed to announce detection:", error);
    throw error;
  }
}

export interface AnalyzeImageResult {
  imageUri: string;
  title: string;
  artist: string;
  type: string;
  description: string;
  historicalPrompt?: string;
  immersivePrompt?: string;
  emotions: string[];
  audioUri: string | null;
  analysisId?: string;
}

/**
 * Detect artwork using Overshoot SDK (fast initial detection)
 */
async function detectArtworkWithOvershoot(
  imageDataUrl: string,
): Promise<string | null> {
  try {
    console.log("🔍 Detecting artwork with Overshoot...");

    // Upload image to backend for Overshoot to process
    const uploadResponse = await fetch(
      "http://localhost:8000/api/upload-temp-image",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          image_base64: imageDataUrl,
        }),
      },
    );

    if (!uploadResponse.ok) {
      console.warn("❌ Image upload for Overshoot failed");
      return null;
    }

    const uploadData = await uploadResponse.json();
    const imageUrl = uploadData.image_url;

    // Call Overshoot detection API on backend
    const detectionResponse = await fetch(
      "http://localhost:8000/api/detect-artwork",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          image_url: imageUrl,
        }),
      },
    );

    if (!detectionResponse.ok) {
      console.warn("⚠️ Overshoot detection not available, skipping...");
      return null;
    }

    const detection = await detectionResponse.json();
    console.log("✅ Overshoot detected:", detection);

    // Extract artwork name from detection
    if (detection.title && detection.title !== "") {
      return detection.title;
    }
    if (detection.description) {
      return detection.description;
    }

    return null;
  } catch (error) {
    console.warn("⚠️ Overshoot detection failed:", error);
    return null;
  }
}

export interface AnalyzeImageResult {
  imageUri: string;
  title: string;
  artist: string;
  type: string;
  description: string;
  historicalPrompt?: string;
  immersivePrompt?: string;
  emotions: string[];
  audioUri: string | null;
  analysisId?: string;
}

export async function analyzeImage(
  imageDataUrl: string,
  mode: "museum" | "monuments" | "landscape",
  overshootDescription?: string,
): Promise<AnalyzeImageResult> {
  console.log(`🎯 Starting ${mode} analysis...`);
  console.log(`   Image data length: ${imageDataUrl.length} chars`);
  console.log(
    `   Overshoot real-time detection: ${overshootDescription || "none"}`,
  );

  try {
    if (mode === "museum") {
      console.log("   Route: Museum mode");
      return await analyzeMuseumMode(imageDataUrl, overshootDescription);
    } else if (mode === "monuments") {
      console.log("   Route: Monuments mode");
      return await analyzeMonumentsMode(imageDataUrl, overshootDescription);
    } else if (mode === "landscape") {
      console.log("   Route: Landscape mode");
      return await analyzeLandscapeMode(imageDataUrl, overshootDescription);
    } else {
      throw new Error(`Unsupported mode: ${mode}`);
    }
  } catch (error) {
    console.error(`❌ Analysis failed for ${mode} mode:`, error);
    if (error instanceof Error) {
      console.error(`   Error name: ${error.name}`);
      console.error(`   Error message: ${error.message}`);
    }
    throw error;
  }
}

async function analyzeMuseumMode(
  imageDataUrl: string,
  overshootDescription?: string,
): Promise<AnalyzeImageResult> {
  console.log("🎨 Museum Mode: Starting analysis...");

  try {
    let analysis;

    // Prioritize real-time Overshoot detection from camera
    if (overshootDescription && overshootDescription.trim() !== "") {
      console.log(
        "✅ Using real-time Overshoot detection:",
        overshootDescription,
      );

      // Extract only the artwork name (before "—" or first sentence)
      let artworkName = overshootDescription.split("—")[0].trim();
      if (!artworkName) {
        artworkName = overshootDescription.split(".")[0].trim();
      }
      console.log("📌 Extracted artwork name:", artworkName);

      // Announce detection with TTS
      try {
        await announceDetection(artworkName);
      } catch (ttsError) {
        console.warn("⚠️ TTS announcement failed:", ttsError);
      }

      // Use fast text-based Navigator query (no vision processing needed!)
      analysis = await analyzeArtworkByName(artworkName, "museum");
      console.log("✅ Fast text-based Navigator analysis complete");
    } else {
      // Fallback: Try static image detection with Overshoot
      console.log(
        "⚠️ No real-time detection, trying static image detection...",
      );
      const detectedName = await detectArtworkWithOvershoot(imageDataUrl);

      if (detectedName) {
        console.log("✅ Static Overshoot detection:", detectedName);
        analysis = await analyzeArtworkByName(detectedName, "museum");
      } else {
        console.log("⚠️ No detection available, using slow vision analysis");
        // Last resort: Full vision analysis (slowest)
        analysis = await analyzeArtwork(
          imageDataUrl,
          "museum",
          overshootDescription,
        );
      }
    }

    console.log("✅ Analysis complete:", analysis.title);

    // Step 2: Generate music with Suno
    let audioUri: string | null = null;
    try {
      console.log("🎵 Generating music with Suno...");
      const musicPrompt = `Create an ambient classical instrumental piece that evokes ${analysis.emotions.join(", ")} feelings, inspired by ${analysis.title}. The music should be contemplative and immersive.`;

      const musicResult = await generateMusic({
        prompt: musicPrompt,
        style: "Classical",
        negativeTags: "Heavy Metal, Upbeat Drums, Rock",
        instrumental: true,
      });

      audioUri = musicResult.audioUrl;
      console.log("✅ Music generated successfully:", audioUri);
    } catch (musicError) {
      console.warn(
        "⚠️ Music generation failed (continuing without music):",
        musicError,
      );
      // Continue without music - not critical
    }

    const result: AnalyzeImageResult = {
      imageUri: imageDataUrl,
      title: analysis.title,
      artist: analysis.artist,
      type: analysis.type,
      description: analysis.description,
      historicalPrompt: analysis.historicalContext || analysis.description,
      immersivePrompt:
        analysis.styleAnalysis ||
        `Imagine standing before ${analysis.title}, taking in every detail of this ${analysis.type.toLowerCase()}. ${analysis.description}`,
      emotions: analysis.emotions,
      audioUri,
    };

    return result;
  } catch (error) {
    console.error("Navigator AI analysis failed:", error);
    // Fallback to placeholder
    return {
      imageUri: imageDataUrl,
      title: "Artwork Analysis",
      artist: "Unknown Artist",
      type: "Painting",
      description:
        "This artwork displays remarkable composition and technique.",
      historicalPrompt:
        "Created during a pivotal period in art history, this piece reflects the cultural and social dynamics of its time.",
      immersivePrompt:
        "Imagine standing before this masterpiece, feeling the energy and emotion that the artist poured into every brushstroke.",
      emotions: ["contemplative", "serene", "powerful"],
      audioUri: null,
    };
  }
}

async function analyzeMonumentsMode(
  imageDataUrl: string,
  overshootDescription?: string,
): Promise<AnalyzeImageResult> {
  console.log("🏛️ Monuments Mode: Starting analysis...");

  try {
    let analysis;

    // Prioritize real-time Overshoot detection
    if (overshootDescription && overshootDescription.trim() !== "") {
      console.log(
        "✅ Using real-time Overshoot detection:",
        overshootDescription,
      );

      // Extract only the monument name
      let monumentName = overshootDescription.split("—")[0].trim();
      if (!monumentName) {
        monumentName = overshootDescription.split(".")[0].trim();
      }
      console.log("📌 Extracted monument name:", monumentName);

      // Announce detection
      try {
        await announceDetection(monumentName);
      } catch (ttsError) {
        console.warn("⚠️ TTS announcement failed:", ttsError);
      }

      analysis = await analyzeArtworkByName(monumentName, "monuments");
    } else {
      // Fallback: Try static image detection
      const detectedName = await detectArtworkWithOvershoot(imageDataUrl);

      if (detectedName) {
        console.log("✅ Static Overshoot detection:", detectedName);
        analysis = await analyzeArtworkByName(detectedName, "monuments");
      } else {
        console.log("⚠️ No detection, using vision analysis");
        analysis = await analyzeArtwork(
          imageDataUrl,
          "monuments",
          overshootDescription,
        );
      }
    }

    return {
      imageUri: imageDataUrl,
      title: analysis.title,
      artist: analysis.artist,
      type: analysis.type,
      description: analysis.description,
      historicalPrompt: analysis.historicalContext || analysis.description,
      emotions: analysis.emotions,
      audioUri: null,
    };
  } catch (error) {
    console.error("Navigator AI analysis failed:", error);
    return {
      imageUri: imageDataUrl,
      title: "Historical Monument",
      artist: "Architect Unknown",
      type: "Architecture",
      description:
        "This monument stands as a testament to human ingenuity and cultural heritage.",
      emotions: ["majestic", "historical", "inspiring"],
      audioUri: null,
    };
  }
}

async function analyzeLandscapeMode(
  imageDataUrl: string,
  overshootDescription?: string,
): Promise<AnalyzeImageResult> {
  console.log("🌄 Landscape Mode: Starting analysis...");

  try {
    let analysis;

    // Prioritize real-time Overshoot detection
    if (overshootDescription && overshootDescription.trim() !== "") {
      console.log(
        "✅ Using real-time Overshoot detection:",
        overshootDescription,
      );

      // Extract only the landscape name
      let landscapeName = overshootDescription.split("—")[0].trim();
      if (!landscapeName) {
        landscapeName = overshootDescription.split(".")[0].trim();
      }
      console.log("📌 Extracted landscape name:", landscapeName);

      // Announce detection
      try {
        await announceDetection(landscapeName);
      } catch (ttsError) {
        console.warn("⚠️ TTS announcement failed:", ttsError);
      }

      analysis = await analyzeArtworkByName(landscapeName, "landscape");
    } else {
      // Fallback: Try static image detection
      const detectedName = await detectArtworkWithOvershoot(imageDataUrl);

      if (detectedName) {
        console.log("✅ Static Overshoot detection:", detectedName);
        analysis = await analyzeArtworkByName(detectedName, "landscape");
      } else {
        console.log("⚠️ No detection, using vision analysis");
        analysis = await analyzeArtwork(
          imageDataUrl,
          "landscape",
          overshootDescription,
        );
      }
    }

    return {
      imageUri: imageDataUrl,
      title: analysis.title,
      artist: analysis.artist,
      type: analysis.type,
      description: analysis.description,
      emotions: analysis.emotions,
      audioUri: null,
    };
  } catch (error) {
    console.error("Navigator AI analysis failed:", error);
    return {
      imageUri: imageDataUrl,
      title: "Natural Landscape",
      artist: "Nature",
      type: "Landscape",
      description:
        "A breathtaking natural scene showcasing the beauty of our planet.",
      emotions: ["peaceful", "vast", "awe-inspiring"],
      audioUri: null,
    };
  }
}

export function extractEmotions(text: string): string[] {
  // Simple emotion extraction (you can enhance this with NLP)
  const emotionKeywords: Record<string, string[]> = {
    joy: ["happy", "joyful", "cheerful", "delightful"],
    sadness: ["sad", "melancholy", "somber", "mournful"],
    calm: ["peaceful", "serene", "tranquil", "calm"],
    power: ["powerful", "strong", "bold", "intense"],
    mystery: ["mysterious", "enigmatic", "cryptic"],
  };

  const foundEmotions: string[] = [];
  const lowerText = text.toLowerCase();

  for (const [emotion, keywords] of Object.entries(emotionKeywords)) {
    if (keywords.some((keyword) => lowerText.includes(keyword))) {
      foundEmotions.push(emotion);
    }
  }

  return foundEmotions.length > 0 ? foundEmotions : ["neutral"];
}
