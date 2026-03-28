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
  includeDiwan: boolean;
  
  areaM2: number;
}

export interface CadExportResponse {
  dxfUrl: string;         // download link for the .dxf file
}

// ── Helpers ──────────────────────────────────────────

export function getFullUrl(path: string): string {
  if (path.startsWith("http")) return path;
  return `${BACKEND_URL}${path}`;
}

// Prompt building is handled by buildPromptForState in Generator.tsx.
// Gemini calls are handled directly in TrialResult.

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
