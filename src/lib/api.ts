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

/** Build the text prompt sent to Gemini (or any LLM). */
export function buildFloorPlanPrompt(
  coordinates: [number, number][],
  form: FloorPlanFormData,
): string {
  return `Generate a residential floor plan for a land plot in Sana'a, Yemen with the following specifications:

Land coordinates (lat, lng): ${JSON.stringify(coordinates)}
Land area: ${form.areaM2.toFixed(1)} m²
Maximum buildable area (70% regulation): ${(form.areaM2 * 0.7).toFixed(1)} m²
Street-facing side: ${form.streetSide}
Street width: ${form.streetWidth}m

Room requirements:
- Bedrooms: ${form.rooms}
- Bathrooms: ${form.bathrooms}
- Kitchen: 1
- Living room: 1
${form.includeDiwan ? "- Diwan (traditional Yemeni reception room): 1 — must be near the entrance" : ""}

Regulations:
- Setback: 1.5m from all non-street sides
- Street setback: based on street width (${form.streetWidth}m)
- Max ground floor coverage: 70%
- Must include stairwell for future vertical expansion

Cultural notes:
- Separate guest area from family area
- Diwan should allow guests without entering private spaces
- Entrance should not directly face living areas for privacy

Generate a clear 2D floor plan image with labeled rooms and dimensions in meters.`;
}

/** Full JSON payload — useful for debugging or forwarding to any backend. */
export function buildApiPayload(
  coordinates: [number, number][],
  form: FloorPlanFormData,
) {
  return {
    prompt: buildFloorPlanPrompt(coordinates, form),
    coordinates,
    land_area_m2: form.areaM2,
    street_side: form.streetSide,
    street_width_m: form.streetWidth,
    rooms: form.rooms,
    bathrooms: form.bathrooms,
    include_diwan: form.includeDiwan,
    user_name: form.userName,
  };
}

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
