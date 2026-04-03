import { useState, useCallback, useEffect } from "react";
import { Link } from "react-router-dom";
import LandMap, { type Direction8 } from "@/components/LandMapStable";
import RequirementsForm, { type FormData, type OutdoorType } from "@/components/RequirementsForm";
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

  const rotateDeg = longestSideAngleDeg;

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
    North: `<text x="${svgW / 2}" y="${svgH - 6}" text-anchor="middle" font-size="13" fill="#16a34a" font-weight="700">▼ Street / الشارع</text>`,
    South: `<text x="${svgW / 2}" y="18" text-anchor="middle" font-size="13" fill="#16a34a" font-weight="700">▲ Street / الشارع</text>`,
    West:  `<text x="${svgW - 8}" y="${svgH / 2}" text-anchor="end" font-size="13" fill="#16a34a" font-weight="700">Street ▶</text>`,
    East:  `<text x="8" y="${svgH / 2}" text-anchor="start" font-size="13" fill="#16a34a" font-weight="700">◀ Street</text>`,
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

// --- Area Classification ---

const classifyArea = (rectAreaM2: number): "micro1" | "micro2" | "small" | "medium" | "large" => {
  if (rectAreaM2 < 40) return "micro1";
  if (rectAreaM2 < 70) return "micro2";
  if (rectAreaM2 < 111) return "small";
  if (rectAreaM2 < 190) return "medium";
  return "large";
};

type DesignState =
  | "micro1"
  | "micro2"
  | "small_front_yard"
  | "small_no_outdoor"
  | "medium_front_yard"
  | "medium_courtyard"
  | "medium_no_outdoor"
  | "large_front_yard"
  | "large_courtyard"
  | "large_no_outdoor"
  | "blocked_courtyard_small";

const detectState = (
  rectAreaM2: number,
  outdoorType: OutdoorType
): DesignState => {
  const cls = classifyArea(rectAreaM2);

  if (cls === "micro1") return "micro1";
  if (cls === "micro2") return "micro2";

  if (cls === "small") {
    if (outdoorType === "courtyard") return "blocked_courtyard_small";
    if (outdoorType === "front_yard") return "small_front_yard";
    return "small_no_outdoor";
  }

  if (cls === "medium") {
    if (outdoorType === "front_yard") return "medium_front_yard";
    if (outdoorType === "courtyard") return "medium_courtyard";
    return "medium_no_outdoor";
  }

  if (outdoorType === "front_yard") return "large_front_yard";
  if (outdoorType === "courtyard") return "large_courtyard";
  return "large_no_outdoor";
};

// --- Prompt Builder ---

const buildPromptForState = (
  state: string,
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
Furniture is not necessary.`;

  const officeBlock = `
- Guest Office: at the entrance on the ${streetSide} side. Has its own separate exterior door from the street.
- Entrance Corridor: small private hall separating the guest office from the rest of the house.
- Guest WC: adjacent to the corridor. For guests only — not connected to family areas.`;

  switch (state) {

    case "micro1":
      return `${base}

SINGLE STUDIO UNIT (very small plot):
- One open living and sleeping space
- Closed kitchen
- Bathroom
- Entrance from ${streetSide} side
- Staircase to roof for future expansion, placed outside if needed.
Label: "Studio / استوديو". Efficient layout, no wasted space.`;

    case "micro2":
      return `${base}

MICRO RESIDENTIAL UNIT:
- Two rooms total. One room is immediately adjacent to the entrance (can serve as reception or second bedroom).
- Kitchen (closed)
- Bathroom
- WC adjacent to the entrance room — accessible without entering private areas
- Entrance from ${streetSide} side
- Staircase to roof for future expansion, placed outside if needed.
Efficient compact layout. Label all rooms clearly.`;

    case "small_front_yard":
      return `${base}

TWO-FLOOR LAYOUT. AI decides room count based on available upper floor space.

GROUND FLOOR:
${officeBlock}
- Kitchen
- Front Yard: open bordered space on the ${streetSide} side, labeled "Front Yard / فناء أمامي". Between the street and the building entrance.
- Staircase connecting floors (place outside footprint if needed).

UPPER FLOOR:
- Bedrooms: AI determines count based on space.
- Bathrooms: AI decides count and placement.

CULTURAL: Guest office on ground floor keeps guests away from family sleeping areas upstairs.`;

    case "small_no_outdoor":
      return `${base}

TWO-FLOOR LAYOUT. AI decides room count based on available space.

GROUND FLOOR:
${officeBlock}
- Kitchen
- Living area
- Staircase connecting floors (place outside footprint if needed).

UPPER FLOOR:
- Bedrooms: AI determines count.
- Bathrooms: AI decides count and placement.

CULTURAL: Staircase acts as separator — guests on ground floor, family upstairs.`;

    case "medium_front_yard":
      return `${base}

SINGLE FLOOR.
${officeBlock}
- Living Room
- Kitchen
- ${bedrooms} Bedrooms (label as Bedroom 1, Bedroom 2, etc.)
- Bathrooms: AI decides count and placement.
- Front Yard: open bordered space on the ${streetSide} side labeled "Front Yard / فناء أمامي". Between street and entrance.
- Staircase for future vertical expansion (place outside footprint if needed).

CULTURAL: Guest must reach office from entrance without crossing family space.`;

    case "medium_courtyard":
      return `${base}

SINGLE FLOOR with central open-air courtyard.
${officeBlock}
- Living Room
- Kitchen
- ${bedrooms} Bedrooms (label separately)
- Bathrooms: AI decides count and placement.
- Courtyard: open-air space in the heart of the home, surrounded by rooms. Label "Courtyard / فناء داخلي".
- Staircase for future vertical expansion (place outside footprint if needed).

CULTURAL: Guest office separated from family by corridor. Courtyard serves family privacy.`;

    case "medium_no_outdoor":
      return `${base}

SINGLE FLOOR, fully interior.
${officeBlock}
- Living Room
- Kitchen
- ${bedrooms} Bedrooms (label separately)
- Bathrooms: AI decides count and placement.
- Staircase for future vertical expansion (place outside footprint if needed).

CULTURAL: Guest must enter office and leave without crossing any family space.`;

    case "large_front_yard":
      return `${base}

LARGE SINGLE FLOOR HOME.
${officeBlock}
- Living Room (large)
- Kitchen
- ${bedrooms} Bedrooms (label separately)
- Bathrooms: AI decides count and placement.
- Front Yard: generous open space on the ${streetSide} side labeled "Front Yard / فناء أمامي".
- Staircase for future vertical expansion (place outside footprint if needed).

CULTURAL: Guest office is the first space encountered from the street. Family areas are deep inside the home.`;

    case "large_courtyard":
      return `${base}

LARGE SINGLE FLOOR HOME with central courtyard.
${officeBlock}
- Living Room (large)
- Kitchen
- ${bedrooms} Bedrooms (label separately)
- Bathrooms: AI decides count and placement.
- Courtyard: large central open-air space at the heart of the home. Label "Courtyard / فناء داخلي". Surrounded by glass corridors.
- Staircase for future vertical expansion (place outside footprint if needed).

CULTURAL: Guest office near street entrance. Courtyard is private family space, not visible from street.`;

    case "large_no_outdoor":
      return `${base}

LARGE SINGLE FLOOR HOME, fully interior.
${officeBlock}
- Living Room (large)
- Kitchen
- ${bedrooms} Bedrooms (label separately)
- Bathrooms: AI decides count and placement.
- Staircase for future vertical expansion (place outside footprint if needed).

CULTURAL: Guest office at entrance with its own door. Family living is deep and private.`;

    default:
      return `${base}\n\nGenerate a suitable residential floor plan for this plot size.`;
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
  const [outdoorType, setOutdoorType] = useState<OutdoorType>("front_yard");
  const [currentState, setCurrentState] = useState<string>("");

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
  const [isMicroPlot, setIsMicroPlot] = useState<boolean>(false);
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
    setIsMicroPlot(false);
    setPolygonSVG('');
    setCurrentState("");
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

    const cappedArea = Math.min(rect.rectAreaM2, 300);
    const cls = classifyArea(cappedArea);
    setIsSmallPlot(cls === "small");
    setIsMicroPlot(cls === "micro1" || cls === "micro2");

    const svg = buildOverlaySVG(coordsArr, rect.rectWidthM, rect.rectDepthM, streetSide, rect.longestSideAngleDeg);
    setPolygonSVG(svg);
  }, [coordinates, streetSide, streetWidth]);

  // Update state whenever outdoor type or area change
  useEffect(() => {
    if (!buildableRect) {
      setCurrentState("");
      return;
    }
    const cappedArea = Math.min(buildableRect.rectAreaM2, 300);
    const state = detectState(cappedArea, outdoorType);
    setCurrentState(state);
  }, [buildableRect, outdoorType]);

  const handleStreetSideChange = useCallback((side: string) => {
    setStreetSide(side);
  }, []);

  const handleStreetWidthChange = useCallback((width: number) => {
    setStreetWidth(width);
  }, []);

  const handleOutdoorChange = useCallback((value: OutdoorType) => {
    setOutdoorType(value);
  }, []);

  const handleSubmit = (data: FormData) => {
    if (!buildableRect) return;

    const rectArea = buildableRect.rectAreaM2;
    const cappedArea = Math.min(rectArea, 300);

    const state = detectState(cappedArea, data.outdoorType);
    setCurrentState(state);

    if (state === "blocked_courtyard_small") return;

    const prompt = buildPromptForState(
      state,
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
      includeDiwan: false,
      areaM2: cappedArea,
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
            longestSideAngleDeg={buildableRect?.longestSideAngleDeg ?? 0}
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
                isMicroPlot={isMicroPlot}
                onStreetSideChange={handleStreetSideChange}
                onStreetWidthChange={handleStreetWidthChange}
                onOutdoorChange={handleOutdoorChange}
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
