/**
 * Navigator API (GPT-4 Vision) Integration
 * Provides AI-powered image analysis for artworks, monuments, and landscapes
 */

const NAVIGATOR_API_KEY = process.env.NEXT_PUBLIC_NAVIGATOR_API_KEY;
const NAVIGATOR_BASE_URL =
  process.env.NEXT_PUBLIC_NAVIGATOR_BASE_URL || "https://api.ai.it.ufl.edu/v1";

export interface NavigatorAnalysisResult {
  title: string;
  artist: string;
  year?: string;
  type: string;
  description: string;
  historicalContext?: string;
  styleAnalysis?: string;
  emotions: string[];
}

/**
 * Analyze artwork using Navigator API (GPT-4 Vision)
 */
export async function analyzeArtwork(
  imageDataUrl: string,
  mode: "museum" | "monuments" | "landscape",
  overshootDescription?: string,
): Promise<NavigatorAnalysisResult> {
  console.log("🔬 Navigator API: Starting analysis...");
  console.log("   Mode:", mode);
  console.log("   API Base URL:", NAVIGATOR_BASE_URL);
  console.log("   Overshoot detected:", overshootDescription);
  console.log(
    "   API Key configured:",
    !!NAVIGATOR_API_KEY && NAVIGATOR_API_KEY !== "your-navigator-api-key-here",
  );

  if (
    !NAVIGATOR_API_KEY ||
    NAVIGATOR_API_KEY === "your-navigator-api-key-here"
  ) {
    const errorMsg = "Navigator API key not configured in .env.local";
    console.error("❌", errorMsg);
    console.error(
      "   Please set NEXT_PUBLIC_NAVIGATOR_API_KEY in your .env.local file",
    );
    throw new Error(errorMsg);
  }

  const overshootContext = overshootDescription
    ? `\n\nNote: Initial detection identified this as: "${overshootDescription}". Use this as a hint to identify the specific artwork name.`
    : "";

  const prompts = {
    museum: `Analyze this artwork in detail. Provide:
1. Title (if recognizable, otherwise describe it) - Extract just the artwork name (e.g., "Mona Lisa" not "a painting of Mona Lisa")
2. Artist name (if known, otherwise "Unknown Artist")
3. Approximate year or period
4. Art type/medium (Painting, Sculpture, etc.)
5. Detailed description of what you see
6. Historical context and significance
7. Style analysis (art movement, techniques, etc.)
8. Emotional themes (list 3-5 emotions the artwork evokes)${overshootContext}

Format your response as JSON with keys: title, artist, year, type, description, historicalContext, styleAnalysis, emotions (array)`,

    monuments: `Analyze this monument or landmark. Provide:
1. Name of the monument - Extract just the monument name
2. Architect or builder (if known)
3. Year built or time period
4. Type (Building, Monument, Memorial, etc.)
5. Detailed description of the structure
6. Historical significance and context
7. Architectural style and features
8. Cultural/emotional significance (3-5 themes)${overshootContext}

Format your response as JSON with keys: title, artist, year, type, description, historicalContext, styleAnalysis, emotions (array)`,

    landscape: `Analyze this natural landscape or scene. Provide:
1. Title/description of the location (if identifiable)
2. Geographic location (if recognizable, otherwise "Natural Scene")
3. Approximate time of day or season (if visible)
4. Type (Mountain, Forest, Beach, etc.)
5. Detailed description of the scene
6. Natural features and characteristics
7. Atmospheric and visual qualities
8. Emotional themes (list 3-5 emotions evoked)

Format your response as JSON with keys: title, artist (use "Nature" or location), year (use season/time), type, description, historicalContext, styleAnalysis, emotions (array)`,
  };

  console.log("📤 Sending request to Navigator API...");
  console.log("   Endpoint:", `${NAVIGATOR_BASE_URL}/chat/completions`);
  console.log("   Model: mistral-small-3.1");
  console.log("   Image size:", imageDataUrl.length, "chars");

  // Navigator API (via LiteLLM) doesn't support data URLs
  // Upload image to backend first to get HTTP URL
  let imageUrl = imageDataUrl;
  if (imageDataUrl.startsWith("data:")) {
    console.log("   Uploading image to backend for HTTP URL...");
    try {
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
        throw new Error(`Upload failed: ${uploadResponse.statusText}`);
      }

      const uploadData = await uploadResponse.json();
      imageUrl = uploadData.image_url;
      console.log("   ✅ Image uploaded:", imageUrl);
    } catch (uploadError) {
      console.error("   ❌ Image upload failed:", uploadError);
      throw new Error(`Failed to upload image for analysis: ${uploadError}`);
    }
  }

  try {
    console.log("⏱️ Sending request with 90s timeout...");
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 90000); // 90 second timeout

    const response = await fetch(`${NAVIGATOR_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${NAVIGATOR_API_KEY}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: "mistral-small-3.1",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompts[mode] },
              {
                type: "image_url",
                image_url: {
                  url: imageUrl,
                },
              },
            ],
          },
        ],
        max_tokens: 1000,
      }),
    });

    clearTimeout(timeoutId);
    console.log("📥 Response received:", response.status, response.statusText);

    if (!response.ok) {
      let errorDetails;
      try {
        errorDetails = await response.json();
      } catch {
        errorDetails = await response.text();
      }
      console.error("❌ Navigator API error response:", errorDetails);
      throw new Error(
        `Navigator API error (${response.status}): ${errorDetails.error?.message || response.statusText}`,
      );
    }

    const data = await response.json();
    console.log(
      "📋 API response data:",
      JSON.stringify(data).substring(0, 500) + "...",
    );

    const content = data.choices[0]?.message?.content;

    if (!content) {
      console.error("❌ No content in response:", data);
      throw new Error("No response from Navigator API");
    }

    console.log("✅ Content received, length:", content.length);

    // Try to parse JSON response
    try {
      console.log("🔍 Attempting to parse JSON from response...");
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        console.log("✅ Successfully parsed JSON:", {
          title: parsed.title,
          artist: parsed.artist,
          type: parsed.type,
          emotions: parsed.emotions,
        });
        return {
          title: parsed.title || "Untitled",
          artist: parsed.artist || "Unknown",
          year: parsed.year,
          type: parsed.type || "Artwork",
          description: parsed.description || content,
          historicalContext: parsed.historicalContext,
          styleAnalysis: parsed.styleAnalysis,
          emotions: parsed.emotions || ["contemplative"],
        };
      }
    } catch (parseError) {
      console.warn("Failed to parse JSON, using raw content");
    }

    // Fallback: use raw content
    return {
      title: "Analyzed Artwork",
      artist: "Unknown",
      type:
        mode === "museum"
          ? "Artwork"
          : mode === "monuments"
            ? "Monument"
            : "Landscape",
      description: content,
      emotions: ["contemplative", "inspiring"],
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      console.error("❌ Navigator API request timed out after 90 seconds");
      throw new Error(
        "Navigator API request timed out. The vision model is taking too long to analyze this image. Please try again or try a different image.",
      );
    }
    console.error("❌ Navigator API request failed:", error);
    throw error;
  }
}

/**
 * Analyze artwork by name/description only (fast, no vision analysis)
 * Uses text-based query instead of image analysis
 */
export async function analyzeArtworkByName(
  artworkName: string,
  mode: "museum" | "monuments" | "landscape",
): Promise<NavigatorAnalysisResult> {
  console.log("🔤 Navigator API: Text-based analysis...");
  console.log("   Artwork name:", artworkName);
  console.log("   Mode:", mode);

  if (
    !NAVIGATOR_API_KEY ||
    NAVIGATOR_API_KEY === "your-navigator-api-key-here"
  ) {
    throw new Error("Navigator API key not configured in .env.local");
  }

  const prompts = {
    museum: `Provide detailed information about "${artworkName}". Include:
1. Full title of the artwork
2. Artist name
3. Year or period created
4. Art type/medium
5. Detailed description and visual characteristics
6. Historical context and significance
7. Style analysis and artistic techniques
8. Emotional themes (3-5 emotions)

Format your response as JSON with keys: title, artist, year, type, description, historicalContext, styleAnalysis, emotions (array)`,

    monuments: `Provide detailed information about "${artworkName}". Include:
1. Official name
2. Architect or builder
3. Year built
4. Type of structure
5. Physical description
6. Historical significance
7. Architectural style and features
8. Cultural significance (3-5 themes)

Format your response as JSON with keys: title, artist, year, type, description, historicalContext, styleAnalysis, emotions (array)`,

    landscape: `Provide information about "${artworkName}" landscape. Include:
1. Location name
2. Geographic details
3. Notable features
4. Type of landscape
5. Visual description
6. Natural or historical significance
7. Atmospheric qualities
8. Emotional themes (3-5 emotions)

Format your response as JSON with keys: title, artist (use location/region), year, type, description, historicalContext, styleAnalysis, emotions (array)`,
  };

  try {
    console.log("⏱️ Sending text-only request with 120s timeout...");
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000);

    const response = await fetch(`${NAVIGATOR_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${NAVIGATOR_API_KEY}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: "mistral-small-3.1",
        messages: [
          {
            role: "user",
            content: prompts[mode],
          },
        ],
        max_tokens: 1000,
      }),
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorDetails = await response.json().catch(() => response.text());
      console.error("❌ Navigator API error:", errorDetails);
      throw new Error(`Navigator API error (${response.status})`);
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content;

    if (!content) {
      throw new Error("No response from Navigator API");
    }

    // Parse JSON response
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          title: parsed.title || artworkName,
          artist: parsed.artist || "Unknown",
          year: parsed.year,
          type: parsed.type || "Artwork",
          description: parsed.description || content,
          historicalContext: parsed.historicalContext,
          styleAnalysis: parsed.styleAnalysis,
          emotions: parsed.emotions || ["contemplative"],
        };
      }
    } catch (parseError) {
      console.warn("Failed to parse JSON, using raw content");
    }

    // Fallback
    return {
      title: artworkName,
      artist: "Unknown",
      type:
        mode === "museum"
          ? "Artwork"
          : mode === "monuments"
            ? "Monument"
            : "Landscape",
      description: content,
      emotions: ["contemplative", "inspiring"],
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(
        "Navigator API request timed out after 120 seconds. The service may be experiencing high load.",
      );
    }
    console.error("❌ Navigator API request failed:", error);
    throw error;
  }
}

/**
 * Quick metadata extraction for faster initial response
 */
export async function getQuickMetadata(
  imageDataUrl: string,
): Promise<{ title: string; artist: string; year?: string }> {
  if (!NAVIGATOR_API_KEY) {
    throw new Error("Navigator API key not configured");
  }

  try {
    const response = await fetch(`${NAVIGATOR_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${NAVIGATOR_API_KEY}`,
      },
      body: JSON.stringify({
        model: "mistral-small-3.1",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Quickly identify: title, artist, and year. Respond in JSON format only: {title, artist, year}",
              },
              {
                type: "image_url",
                image_url: {
                  url: imageDataUrl,
                },
              },
            ],
          },
        ],
        max_tokens: 100,
      }),
    });

    if (!response.ok) throw new Error("Quick metadata failed");

    const data = await response.json();
    const content = data.choices[0]?.message?.content;
    const jsonMatch = content?.match(/\{[\s\S]*\}/);

    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }

    return { title: "Artwork", artist: "Unknown" };
  } catch (error) {
    console.error("Quick metadata failed:", error);
    return { title: "Artwork", artist: "Unknown" };
  }
}
