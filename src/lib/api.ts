// ====================================================
// Central API layer — change URLs / keys here only
// ====================================================

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:8000";
const GEMINI_URL  = import.meta.env.VITE_GEMINI_URL  || ""; // e.g. https://generativelanguage.googleapis.com/v1beta/models/gemini-pro-vision:generateContent
const GEMINI_KEY  = import.meta.env.VITE_GEMINI_KEY  || "";
const CAD_URL     = import.meta.env.VITE_CAD_URL     || `${BACKEND_URL}/export-cad`;

// ── Types ────────────────────────────────────────────

export interface LandAnalysis {
  area_m2: number;
  max_buildable_m2: number;
  approx_width_m: number;
  approx_depth_m: number;
  sides: number;
}

/** @deprecated use GeminiResponse instead — kept for ResultsSection compatibility */
export interface GenerateResponse {
  status: string;
  land_area_m2: number;
  max_buildable_m2: number;
  image_url: string;
  dxf_url: string;
  room_data: Record<string, unknown>;
}

export interface FloorPlanFormData {
  streetSide: string;
  streetWidth: number;
  rooms: number;
  bathrooms: number;
  includeDiwan: boolean;
  userName: string;
  areaM2: number;
}

export interface GeminiResponse {
  imageUrl: string;       // base64 data-url or hosted url returned by Gemini
  rawResponse?: unknown;  // full API response for debugging
}

export interface CadExportResponse {
  dxfUrl: string;         // download link for the .dxf file
}

// ── Helpers ──────────────────────────────────────────

export function getFullUrl(path: string): string {
  if (path.startsWith("http")) return path;
  return `${BACKEND_URL}${path}`;
}

// Old buildFloorPlanPrompt and buildApiPayload removed.
// Prompt building is now handled by buildPromptForState in Generator.tsx.

// ── API calls ────────────────────────────────────────

/** Analyze land polygon via the Python backend. */
export async function analyzeLand(
  coordinates: [number, number][],
): Promise<LandAnalysis> {
  const res = await fetch(`${BACKEND_URL}/analyze-land`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ coordinates }),
  });
  if (!res.ok) throw new Error("Failed to analyze land");
  return res.json();
}

/**
 * Generate a floor-plan image via Google Gemini API.
 * Replace the implementation when you swap to a different provider.
 */
export async function generateFloorPlan(
  coordinates: [number, number][],
  form: FloorPlanFormData,
): Promise<GeminiResponse> {
  const payload = buildApiPayload(coordinates, form);

  if (!GEMINI_URL || !GEMINI_KEY) {
    // ── Placeholder until keys are configured ──
    console.warn("[api] Gemini not configured – returning placeholder. Payload:", payload);
    return { imageUrl: "", rawResponse: payload };
  }

  const res = await fetch(`${GEMINI_URL}?key=${GEMINI_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: payload.prompt }] }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini API error (${res.status}): ${errText}`);
  }

  const data = await res.json();
  // Extract image from Gemini response — adjust path based on actual model
  const imageUrl =
    data?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data
      ? `data:image/png;base64,${data.candidates[0].content.parts[0].inlineData.data}`
      : "";

  return { imageUrl, rawResponse: data };
}

/**
 * Export a floor-plan image to a DXF/CAD file via the Python backend.
 * Sends the image URL (or base64) to the conversion endpoint.
 */
export async function exportCad(imageUrl: string): Promise<CadExportResponse> {
  if (!imageUrl) {
    throw new Error("No image available for CAD export");
  }

  const res = await fetch(CAD_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image_url: imageUrl }),
  });

  if (!res.ok) throw new Error("CAD export failed");
  return res.json();
}
