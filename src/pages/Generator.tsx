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
): number => {
  const hasArea = landAreaM2 >= 110;

  if (hasArea && includeDiwan && includeGarden) return 1;
  if (hasArea && includeDiwan && !includeGarden) return 2;
  if (hasArea && !includeDiwan && !includeGarden) return 3;
  if (!hasArea && includeDiwan && includeGarden) return 4;
  if (!hasArea && !includeDiwan && includeGarden) return 5;
  return 6;
};

// --- 6 Prompt Builder ---

const buildPromptForState = (
  state: number,
  rectWidthM: number,
  rectDepthM: number,
  streetSide: string,
  streetWidth: number,
  bedrooms: number,
  bathrooms: number
): string => {
  const base = `You are an architect. Generate a CAD-style floor plan.
Black lines on white background.
Label every room with name and size in meters.
No furniture. Room outlines and names only.
Building footprint: ${rectWidthM}m wide x ${rectDepthM}m deep.
Street is on the ${streetSide} side. Street width: ${streetWidth}m.
Main entrance must face the ${streetSide} side.
North arrow required. Scale bar required.
Show south-side shading as a simple rectangle on the ${streetSide === "South" ? "South" : "south"} facade.`;

  switch (state) {
    case 1:
      return `${base}

DESIGN TYPE: Large plot with guest office, garden, and full family home.

GROUND FLOOR:
- Guest Office (with private WC and small waiting area): adjacent to main entrance on ${streetSide} side. Has its own separate entrance door from street. Connected to rest of house by one internal door only.
- Living Room: min 15m²
- Kitchen: min 8m², south side
- Family Bathroom: min 4m²
- Garden: outdoor space, min 15m², accessible from living room. Shown as open area with border.

UPPER FLOOR(S):
- ${bedrooms} Bedrooms (each min 9m²)
- ${bathrooms} Bathrooms (each min 4m²)
- Staircase connecting floors

NOTES:
- Guest office must be accessible without entering family areas
- Label garden clearly as "Garden / حديقة"`;

    case 2:
      return `${base}

DESIGN TYPE: Large plot with integrated guest suite and family home on one or two floors.

LAYOUT:
- Guest Suite near main entrance on ${streetSide} side:
  * Waiting/Reception corridor (min 3m²)
  * Private Office/Guest Room (min 9m²)
  * Guest WC (min 2m²)
  * Separate entrance door from street
  * One internal door connecting to family area
- Living Room: min 15m²
- Kitchen: min 8m², south side
- ${bedrooms} Bedrooms (each min 9m²)
- ${bathrooms} Bathrooms (each min 4m²)
- Staircase if two floors

NOTES:
- Guest suite must have full privacy from family spaces
- No garden — use all buildable area for interior spaces`;

    case 3:
      return `${base}

DESIGN TYPE: Large residential plot — two independent studio units on ground floor, shared roof access.

LAYOUT — GROUND FLOOR:
- Unit A:
  * Living/Bedroom space (min 20m²)
  * Kitchen corner (min 5m²)
  * Bathroom (min 4m²)
  * Private entrance from ${streetSide} side
- Unit B:
  * Living/Bedroom space (min 20m²)
  * Kitchen corner (min 5m²)
  * Bathroom (min 4m²)
  * Private entrance from ${streetSide} side
- Shared staircase to roof (shown clearly)

NOTES:
- Two completely independent units, no shared interior spaces
- Both entrances face the ${streetSide} side
- Label clearly: "Unit A", "Unit B", "Shared Staircase"`;

    case 4:
      return `${base}

DESIGN TYPE: Small plot, two-floor home with garden and guest reception on ground floor.

GROUND FLOOR:
- Guest Reception Room (min 9m²): adjacent to entrance, separated from family areas by wall and door
- Guest WC (min 2m²): adjacent to reception
- Kitchen (min 5m²): south side
- Garden: outdoor area, remainder of ground floor footprint. Shown as open bordered area.

UPPER FLOOR:
- Bedrooms (AI decides count based on space): each min 9m²
- Bathroom (min 4m²)
- Staircase connecting floors

NOTES:
- AI determines number of bedrooms based on available upper floor area
- Garden must be accessible from ground floor interior
- Label all spaces clearly`;

    case 5:
      return `${base}

DESIGN TYPE: Small plot with garden, compact two-floor home, staircase as privacy separator.

GROUND FLOOR:
- Living Room (min 9m²)
- Kitchen (min 5m²): south side
- Bathroom (min 4m²)
- Garden: outdoor space alongside building. Shown as open bordered area.
- Staircase: positioned to separate living area from bedroom floor above

UPPER FLOOR:
- Bedrooms (AI decides count): each min 9m²
- Bathroom (min 4m²)

NOTES:
- Staircase acts as spatial separator between public ground floor and private upper floor
- Garden shown clearly as outdoor space with label "Garden / حديقة"`;

    case 6:
    default:
      return `${base}

DESIGN TYPE: Small plot — compact studio apartment, maximum use of available space.

LAYOUT (single floor or split level):
- Main living/sleeping space (min 18m²)
- Kitchen area (min 4m²): south side
- Bathroom (min 4m²)
- Entrance from ${streetSide} side
- Staircase to roof for access

NOTES:
- Single compact unit
- Efficient layout, no wasted circulation space
- Label: "Studio / استوديو"`;
  }
};

export default function Generator() {
  const [coordinates, setCoordinates] = useState<[number, number][]>([]);
  const [areaM2, setAreaM2] = useState(0);
  const [hasPolygon, setHasPolygon] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [detectedStreetSide, setDetectedStreetSide] = useState<string | undefined>();
  const [submittedFormData, setSubmittedFormData] = useState<FloorPlanFormData | null>(null);

  const [streetSide, setStreetSide] = useState<string>("South");
  const [streetWidth, setStreetWidth] = useState<number>(10);
  const [includeDiwan, setIncludeDiwan] = useState<boolean>(true);
  const [includeGarden, setIncludeGarden] = useState<boolean>(false);
  const [currentState, setCurrentState] = useState<number>(0);

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

    setSubmittedFormData({
      streetSide: data.streetSide,
      streetWidth: data.streetWidth,
      rooms: data.rooms,
      bathrooms: data.bathrooms,
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
