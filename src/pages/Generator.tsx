import { useState, useCallback, useEffect } from "react";
import { Link } from "react-router-dom";
import LandMap, { type Direction8 } from "@/components/LandMapStable";
import RequirementsForm, { type FormData } from "@/components/RequirementsForm";
import type { FloorPlanFormData } from "@/lib/api";
import TrialResult from "@/components/TrialResult";
import PolygonPreviewCard from "@/components/PolygonPreviewCard";
import CalculationsPanel from "@/components/CalculationsPanel";

// --- Utility functions (client-side only) ---

const autoDetectStreetSide = (coords: number[][]): string => {
  const refLat = coords[0][0];
  const refLng = coords[0][1];

  const meterCoords = coords.map(([lat, lng]) => ({
    x: (lng - refLng) * 111320 * Math.cos((refLat * Math.PI) / 180),
    y: (lat - refLat) * 110540,
  }));

  const n = meterCoords.length;

  const sides = [];
  for (let i = 0; i < n; i++) {
    const p1 = meterCoords[i];
    const p2 = meterCoords[(i + 1) % n];
    const length = Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2);

    const angle = Math.atan2(p2.x - p1.x, p2.y - p1.y) * (180 / Math.PI);
    const bearing = (angle + 360) % 360;

    let direction = "South";
    if (bearing >= 315 || bearing < 45) direction = "North";
    else if (bearing >= 45 && bearing < 135) direction = "East";
    else if (bearing >= 135 && bearing < 225) direction = "South";
    else if (bearing >= 225 && bearing < 315) direction = "West";

    sides.push({ length, direction });
  }

  const directionLengths: Record<string, number> = {
    North: 0, South: 0, East: 0, West: 0,
  };

  for (const side of sides) {
    if (side.length > directionLengths[side.direction]) {
      directionLengths[side.direction] = side.length;
    }
  }

  const detected = Object.entries(directionLengths)
    .sort((a, b) => b[1] - a[1])[0][0];

  return detected;
};

const calculateBuildableRectangle = (
  coords: number[][],
  streetSide: string,
): {
  rectWidthM: number;
  rectDepthM: number;
  rectAreaM2: number;
  landAreaM2: number;
  maxBuildableM2: number;
  adjustedForCoverage: boolean;
  longestSideAngleDeg: number;
} => {
  const refLat = coords[0][0];
  const refLng = coords[0][1];

  const meterCoords = coords.map(([lat, lng]) => ({
    x: (lng - refLng) * 111320 * Math.cos((refLat * Math.PI) / 180),
    y: (lat - refLat) * 110540,
  }));

  const n = meterCoords.length;

  const sides = [];
  for (let i = 0; i < n; i++) {
    const p1 = meterCoords[i];
    const p2 = meterCoords[(i + 1) % n];
    const length = Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2);
    const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x) * (180 / Math.PI);
    sides.push({ length, angle, index: i });
  }

  const sorted = [...sides].sort((a, b) => a.length - b.length);

  const side1 = sorted[0].length;
  const side3 = sorted[Math.min(2, sorted.length - 1)].length;

  let rectW = Math.max(side1, side3);
  let rectH = Math.min(side1, side3);

  rectW = Math.max(0, rectW - 1);
  rectH = Math.max(0, rectH - 1);

  let landArea = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    landArea += meterCoords[i].x * meterCoords[j].y;
    landArea -= meterCoords[j].x * meterCoords[i].y;
  }
  const landAreaM2 = Math.abs(landArea / 2);
  const maxBuildableM2 = landAreaM2 * 0.70;

  let rectArea = rectW * rectH;
  let adjusted = false;
  if (rectArea > maxBuildableM2) {
    adjusted = true;
    if (rectW >= rectH) {
      rectW = maxBuildableM2 / rectH;
    } else {
      rectH = maxBuildableM2 / rectW;
    }
    rectArea = rectW * rectH;
  }

  const longestSide = [...sides].sort((a, b) => b.length - a.length)[0];
  const longestSideAngleDeg = longestSide.angle;

  return {
    rectWidthM: Math.round(rectW * 10) / 10,
    rectDepthM: Math.round(rectH * 10) / 10,
    rectAreaM2: Math.round(rectArea * 10) / 10,
    landAreaM2: Math.round(landAreaM2 * 10) / 10,
    maxBuildableM2: Math.round(maxBuildableM2 * 10) / 10,
    adjustedForCoverage: adjusted,
    longestSideAngleDeg,
  };
};

const buildOverlaySVG = (
  coords: number[][],
  rectWidthM: number,
  rectDepthM: number,
  streetSide: string,
  longestSideAngleDeg: number,
): string => {
  const refLat = coords[0][0];
  const refLng = coords[0][1];

  const meterCoords = coords.map(([lat, lng]) => ({
    x: (lng - refLng) * 111320 * Math.cos((refLat * Math.PI) / 180),
    y: (lat - refLat) * 110540,
  }));

  const xs = meterCoords.map(c => c.x);
  const ys = meterCoords.map(c => c.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const rangeX = Math.max(...xs) - minX || 1;
  const rangeY = Math.max(...ys) - minY || 1;

  const padding = 80;
  const svgW = 700;
  const svgH = 440;
  const scaleX = (svgW - padding * 2) / rangeX;
  const scaleY = (svgH - padding * 2) / rangeY;
  const scale = Math.min(scaleX, scaleY);

  const svgPoints = meterCoords.map(c => ({
    x: padding + (c.x - minX) * scale,
    y: svgH - padding - (c.y - minY) * scale,
  }));
  const polyPointsStr = svgPoints.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

  const n = meterCoords.length;
  const sideLabels = svgPoints.map((p, i) => {
    const next = svgPoints[(i + 1) % svgPoints.length];
    const mx = (p.x + next.x) / 2;
    const my = (p.y + next.y) / 2;
    const m1 = meterCoords[i];
    const m2 = meterCoords[(i + 1) % n];
    const dist = Math.sqrt((m2.x - m1.x) ** 2 + (m2.y - m1.y) ** 2);

    const dx = next.y - p.y;
    const dy = -(next.x - p.x);
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const ox = (dx / len) * 18;
    const oy = (dy / len) * 18;

    return `<text x="${(mx + ox).toFixed(1)}" y="${(my + oy).toFixed(1)}"
      text-anchor="middle" font-size="12"
      fill="#c2410c" font-weight="600">${dist.toFixed(1)}m</text>`;
  }).join('');

  const dots = svgPoints.map(p =>
    `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="5" fill="#ea580c"/>`
  ).join('');

  const centerSvgX = svgPoints.reduce((s, p) => s + p.x, 0) / svgPoints.length;
  const centerSvgY = svgPoints.reduce((s, p) => s + p.y, 0) / svgPoints.length;

  const rW = rectWidthM * scale;
  const rH = rectDepthM * scale;

  const rx = -rW / 2;
  const ry = -rH / 2;

  const rotateDeg = -longestSideAngleDeg;

  const rectLabels = `
    <text x="${rW / 2}" y="${ry - 8}"
      text-anchor="middle" font-size="12"
      fill="#1d4ed8" font-weight="700">${rectWidthM.toFixed(1)}m</text>
    <text x="${rx + rW + 10}" y="0"
      text-anchor="start" font-size="12"
      fill="#1d4ed8" font-weight="700"
      dominant-baseline="middle">${rectDepthM.toFixed(1)}m</text>
  `;

  const streetLabels: Record<string, string> = {
    South: `<text x="${svgW / 2}" y="${svgH - 6}" text-anchor="middle" font-size="13" fill="#16a34a" font-weight="700">▼ Street / الشارع</text>`,
    North: `<text x="${svgW / 2}" y="18" text-anchor="middle" font-size="13" fill="#16a34a" font-weight="700">▲ Street / الشارع</text>`,
    East:  `<text x="${svgW - 8}" y="${svgH / 2}" text-anchor="end" font-size="13" fill="#16a34a" font-weight="700">Street ▶</text>`,
    West:  `<text x="8" y="${svgH / 2}" text-anchor="start" font-size="13" fill="#16a34a" font-weight="700">◀ Street</text>`,
  };

  const legend = `
    <rect x="10" y="10" width="14" height="14" fill="#fff7ed" stroke="#ea580c" stroke-width="2"/>
    <text x="28" y="22" font-size="12" fill="#374151">Land boundary / حدود الأرض</text>
    <rect x="10" y="30" width="14" height="14" fill="#dbeafe" stroke="#1d4ed8" stroke-width="2" stroke-dasharray="4,2"/>
    <text x="28" y="42" font-size="12" fill="#374151">Buildable rectangle / مستطيل البناء</text>
  `;

  return `
<svg viewBox="0 0 ${svgW} ${svgH}" xmlns="http://www.w3.org/2000/svg"
  style="width:100%;height:auto;background:#f9fafb;border-radius:8px;">

  ${legend}

  <!-- Polygon -->
  <polygon points="${polyPointsStr}"
    fill="#fff7ed" stroke="#ea580c" stroke-width="2.5"/>
  ${dots}
  ${sideLabels}

  <!-- Rotated rectangle centered on polygon centroid -->
  <g transform="translate(${centerSvgX.toFixed(1)}, ${centerSvgY.toFixed(1)}) rotate(${rotateDeg.toFixed(1)})">
    <rect x="${rx.toFixed(1)}" y="${ry.toFixed(1)}"
      width="${rW.toFixed(1)}" height="${rH.toFixed(1)}"
      fill="#dbeafe" fill-opacity="0.55"
      stroke="#1d4ed8" stroke-width="2.5"
      stroke-dasharray="7,3"/>
    ${rectLabels}
  </g>

  ${streetLabels[streetSide] || ''}

</svg>`;
};

// --- State Detector ---

const detectState = (
  landAreaM2: number,
  includeDiwan: boolean,
  includeGarden: boolean
): number | "blocked_western" | "blocked_toosmall" => {
  const hasArea = landAreaM2 >= 110;

  if (hasArea && includeDiwan && includeGarden) return 1;
  if (hasArea && includeDiwan && !includeGarden) return 2;
  if (hasArea && !includeDiwan && !includeGarden) return 3;
  if (!hasArea && includeDiwan && includeGarden) return 4;
  if (!hasArea && !includeDiwan && includeGarden) return "blocked_toosmall";
  if (!hasArea && includeDiwan && !includeGarden) return 5;
  if (!hasArea && !includeDiwan && !includeGarden) return 6;
  if (hasArea && !includeDiwan && includeGarden) return "blocked_western";

  return 6;
};

// --- 6 Prompt Builder ---

const stateLabels: Record<string | number, string> = {
  1: "Full Home + Office + Garden",
  2: "Full Home + Guest Office",
  3: "Two Residential Flats",
  4: "Two-Floor + Office + Garden",
  5: "Two-Floor + Guest Office",
  6: "Studio",
  "blocked_western": "⚠️ Not available",
  "blocked_toosmall": "⚠️ Not available",
};

const buildPromptForState = (
  state: number,
  rectWidthM: number,
  rectDepthM: number,
  streetSide: string,
  bedrooms: number
): string => {

  const base = `Generate a 2D architectural floor plan drawing.
Black lines on white background. CAD style.
Label every room with its name and dimensions in meters.
Building footprint: ${rectWidthM.toFixed(1)}m wide x ${rectDepthM.toFixed(1)}m deep.
The ${streetSide} side is the street side — main entrance must face the ${streetSide}.
North arrow in the corner. Scale bar at the bottom.
On the south-facing wall, draw small filled rectangles to represent louvre shading elements.
Include a staircase for future vertical expansion — place it outside the building footprint if interior space is limited.
Furniture is not necessary.`;

  switch (state) {

    case 1:
      return `${base}

ROOMS:
- Guest Office: at the entrance on the ${streetSide} side. Has its own separate exterior door from the street. Connected to the rest of the house through one door only.
- Entrance Corridor: small hall separating the guest office from the rest of the house.
- Guest WC: adjacent to the guest office. For guests only.
- Living Room
- Kitchen
- ${bedrooms} Bedrooms (label as Bedroom 1, Bedroom 2, etc.)
- Bathrooms: AI decides count and placement.
- Garden: outdoor space shown as an open bordered rectangle labelled "Garden / حديقة". Accessible from the living room.
- Staircase connecting floors shown with stair symbol.

CULTURAL:
- Guest must reach the office from the entrance without crossing any family space.
- Entrance corridor is the privacy buffer between guest office and family area.
- Guest WC is for guests only, separate from family bathrooms.`;

    case 2:
      return `${base}

ROOMS:
- Guest Office: at the entrance on the ${streetSide} side. Has its own separate exterior door from the street.
- Entrance Corridor / Waiting Hall: separates the guest office from the rest of the house. This is the privacy buffer.
- Guest WC: accessible from the corridor only, not from the family area.
- Living Room
- Kitchen
- ${bedrooms} Bedrooms (label separately)
- Bathrooms: AI decides count and placement.
- Staircase shown with stair symbol.

CULTURAL:
- A guest must enter the office, use the WC, and leave without seeing or entering the living room or bedrooms.
- The corridor must physically block the line of sight from the entrance to the family area.`;

    case 3:
      return `${base}

TWO SMALL RESIDENTIAL FLATS side by side.
The AI divides the total area wisely and equally between the two flats.

Flat A (left side):
- Bedrooms: AI decides based on available space
- Living area
- Kitchen
- Bathroom
- Private entrance from the ${streetSide} side

Flat B (right side):
- Bedrooms: AI decides based on available space
- Living area
- Kitchen
- Bathroom
- Private entrance from the ${streetSide} side

Shared staircase between the two flats leading to roof for future vertical expansion. Place outside between units if space is tight.
Label clearly: "Flat A / شقة أ", "Flat B / شقة ب", "Staircase / سلم".`;

    case 4:
      return `${base}

TWO FLOORS. AI decides room count based on available space.

GROUND FLOOR:
- Guest Office: at entrance on ${streetSide} side. Separate exterior door.
- Entrance Corridor: separates guest office from rest of ground floor.
- Guest WC: adjacent to corridor.
- Kitchen
- Garden: outdoor space shown as open bordered rectangle labelled "Garden / حديقة". Accessible from inside. Not accessible from the street directly.

UPPER FLOOR:
- Bedrooms: AI determines count.
- Bathrooms: AI decides count and placement.
- Staircase connecting floors.

CULTURAL:
- Guest office on ground floor keeps guests away from family sleeping areas upstairs.
- Garden is a private family space, not visible or accessible from the street.`;

    case 5:
      return `${base}

TWO FLOORS. AI decides room count based on available space.

GROUND FLOOR:
- Guest Office: at entrance on ${streetSide} side. Separate exterior door.
- Entrance Corridor: privacy buffer between guest office and rest of house.
- Guest WC
- Kitchen
- Staircase: positioned as a physical separator between the guest area and family area above.

UPPER FLOOR:
- Bedrooms: AI determines count.
- Bathrooms: AI decides count and placement.

CULTURAL:
- Guests stay on the ground floor. Family retreats upstairs.
- No direct visual connection from entrance to any bedroom.`;

    case 6:
    default:
      return `${base}

SINGLE COMPACT UNIT — STUDIO:
- Main living and sleeping space
- Kitchen area
- Bathroom
- Entrance from ${streetSide} side
- Staircase to roof access shown.

Label the unit: "Studio / استوديو".
Efficient layout. No wasted circulation space.`;
  }
};

export default function Generator() {
  const [coordinates, setCoordinates] = useState<[number, number][]>([]);
  const [areaM2, setAreaM2] = useState(0);
  const [hasPolygon, setHasPolygon] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [detectedStreetSide, setDetectedStreetSide] = useState<string | undefined>();
  const [submittedFormData, setSubmittedFormData] = useState<FloorPlanFormData | null>(null);
  const [generatedPrompt, setGeneratedPrompt] = useState<string>("");

  const [streetSide, setStreetSide] = useState<string>("South");
  const [streetWidth, setStreetWidth] = useState<number>(10);
  const [includeDiwan, setIncludeDiwan] = useState<boolean>(true);
  const [includeGarden, setIncludeGarden] = useState<boolean>(false);
  const [currentState, setCurrentState] = useState<number | "blocked_western" | "blocked_toosmall">(0);

  const [buildableRect, setBuildableRect] = useState<{
    rectWidthM: number;
    rectDepthM: number;
    rectAreaM2: number;
    landAreaM2: number;
    maxBuildableM2: number;
    adjustedForCoverage: boolean;
    longestSideAngleDeg: number;
  } | null>(null);
  const [buildingStats, setBuildingStats] = useState<{ maxHeightM: number; maxFloors: number }>({ maxHeightM: 0, maxFloors: 0 });
  const [isSmallPlot, setIsSmallPlot] = useState<boolean>(false);
  const [polygonSVG, setPolygonSVG] = useState<string>('');

  const handlePolygonComplete = useCallback((coords: [number, number][], area: number, _streetSideDetected: Direction8) => {
    setCoordinates(coords);
    setAreaM2(area);
    setHasPolygon(true);

    const coordsArr = coords.map(([lat, lng]) => [lat, lng]);
    const detected = autoDetectStreetSide(coordsArr);
    setDetectedStreetSide(detected);
    setStreetSide(detected);
  }, []);

  const handlePolygonCleared = useCallback(() => {
    setCoordinates([]);
    setAreaM2(0);
    setHasPolygon(false);
    setDetectedStreetSide(undefined);
    setBuildableRect(null);
    setBuildingStats({ maxHeightM: 0, maxFloors: 0 });
    setIsSmallPlot(false);
    setPolygonSVG('');
    setCurrentState(0);
  }, []);

  // Run all calculations when inputs change
  useEffect(() => {
    if (coordinates.length < 3 || !streetWidth || !streetSide) return;

    const coordsArr = coordinates.map(([lat, lng]) => [lat, lng]);

    const rect = calculateBuildableRectangle(coordsArr, streetSide);
    setBuildableRect(rect);

    const setbackSum = 3;
    const maxHeightM = streetWidth + setbackSum;
    const maxFloors = Math.floor(maxHeightM / 3.5);
    setBuildingStats({ maxHeightM, maxFloors });

    const small = rect.landAreaM2 < 110;
    setIsSmallPlot(small);

    const svg = buildOverlaySVG(coordsArr, rect.rectWidthM, rect.rectDepthM, streetSide, rect.longestSideAngleDeg);
    setPolygonSVG(svg);
  }, [coordinates, streetSide, streetWidth]);

  // Update state whenever toggles or area change
  useEffect(() => {
    if (!buildableRect) {
      setCurrentState(0);
      return;
    }
    const state = detectState(buildableRect.landAreaM2, includeDiwan, includeGarden);
    setCurrentState(state);
  }, [buildableRect, includeDiwan, includeGarden]);

  const handleStreetSideChange = useCallback((side: string) => {
    setStreetSide(side);
  }, []);

  const handleStreetWidthChange = useCallback((width: number) => {
    setStreetWidth(width);
  }, []);

  const handleDiwanChange = useCallback((value: boolean) => {
    setIncludeDiwan(value);
  }, []);

  const handleGardenChange = useCallback((value: boolean) => {
    setIncludeGarden(value);
  }, []);

  const handleSubmit = (data: FormData) => {
    if (!buildableRect) return;

    const state = detectState(buildableRect.landAreaM2, data.includeDiwan, data.includeGarden);
    setCurrentState(state);

    if (state === "blocked_western" || state === "blocked_toosmall") {
      // Don't generate — blocked states are handled in the UI
      return;
    }

    const prompt = buildPromptForState(
      state as number,
      buildableRect.rectWidthM,
      buildableRect.rectDepthM,
      data.streetSide,
      data.rooms
    );

    setGeneratedPrompt(prompt);
    setSubmittedFormData({
      streetSide: data.streetSide,
      streetWidth: data.streetWidth,
      rooms: data.rooms,
      includeDiwan: data.includeDiwan,
      userName: data.userName,
      areaM2,
    });
    setShowResult(true);
  };

  const handleReset = () => {
    setShowResult(false);
    setSubmittedFormData(null);
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container flex items-center justify-between h-14 px-4">
          <Link to="/" className="font-bold text-lg">
            اعمار <span className="text-muted-foreground">Emmar</span>
          </Link>
        </div>
      </header>

      <main className="container py-6 px-4">
        {showResult && submittedFormData ? (
          <TrialResult
            coordinates={coordinates}
            formData={submittedFormData}
            prompt={generatedPrompt}
            polygonSVG={polygonSVG}
            vertexCount={coordinates.length}
            longestSideAngleDeg={rectCalc?.longestSideAngleDeg ?? 0}
            onReset={handleReset}
          />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            <div className="lg:col-span-3 space-y-4">
              <h2 className="text-lg font-semibold mb-3">Draw Your Land / ارسم أرضك</h2>
              <LandMap
                onPolygonComplete={handlePolygonComplete}
                onPolygonCleared={handlePolygonCleared}
              />

              {hasPolygon && polygonSVG && (
                <PolygonPreviewCard svgContent={polygonSVG} vertexCount={coordinates.length} />
              )}

              {hasPolygon && buildableRect && (
                <CalculationsPanel
                  areaM2={buildableRect.landAreaM2}
                  maxBuildableM2={buildableRect.maxBuildableM2}
                  buildableRect={buildableRect}
                  buildingHeightM={buildingStats.maxHeightM}
                  maxFloors={buildingStats.maxFloors}
                  streetSide={streetSide}
                />
              )}
            </div>
            <div className="lg:col-span-2">
              <RequirementsForm
                hasPolygon={hasPolygon}
                onSubmit={handleSubmit}
                isLoading={false}
                detectedStreetSide={detectedStreetSide}
                isSmallPlot={isSmallPlot}
                onStreetSideChange={handleStreetSideChange}
                onStreetWidthChange={handleStreetWidthChange}
                onDiwanChange={handleDiwanChange}
                onGardenChange={handleGardenChange}
                currentState={currentState}
              />
            </div>
          </div>
        )}
      </main>

      <footer className="border-t py-4">
        <p className="text-center text-xs text-muted-foreground px-4">
          Developed as part of academic research on AI-assisted architectural design for developing countries | Aden, Yemen
        </p>
      </footer>
    </div>
  );
}
