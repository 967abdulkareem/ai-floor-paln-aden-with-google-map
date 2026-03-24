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
} => {
  const refLat = coords[0][0];
  const refLng = coords[0][1];

  const meterCoords = coords.map(([lat, lng]) => ({
    x: (lng - refLng) * 111320 * Math.cos((refLat * Math.PI) / 180),
    y: (lat - refLat) * 110540,
  }));

  const n = meterCoords.length;
  const sideLengths: number[] = [];
  for (let i = 0; i < n; i++) {
    const p1 = meterCoords[i];
    const p2 = meterCoords[(i + 1) % n];
    const length = Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2);
    sideLengths.push(length);
  }

  const sorted = [...sideLengths].sort((a, b) => a - b);
  const shortSide1 = sorted[0];
  const shortSide2 = sorted[1];

  let rectW = Math.max(shortSide1, shortSide2);
  let rectH = Math.min(shortSide1, shortSide2);

  const setback = 1;
  rectW -= setback;
  rectH -= setback;

  // Shoelace formula for land area
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

  return {
    rectWidthM: Math.round(rectW * 10) / 10,
    rectDepthM: Math.round(rectH * 10) / 10,
    rectAreaM2: Math.round(rectArea * 10) / 10,
    landAreaM2: Math.round(landAreaM2 * 10) / 10,
    maxBuildableM2: Math.round(maxBuildableM2 * 10) / 10,
    adjustedForCoverage: adjusted,
  };
};

const calculateBuildingStats = (
  streetWidth: number,
): {
  maxHeightM: number;
  maxFloors: number;
} => {
  const setbackSum = 3;
  const maxHeightM = streetWidth + setbackSum;
  const maxFloors = Math.floor(maxHeightM / 3.5);
  return { maxHeightM, maxFloors };
};

const buildOverlaySVG = (
  coords: number[][],
  rectWidthM: number,
  rectDepthM: number,
  streetSide: string,
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

  const padding = 70;
  const svgW = 700;
  const svgH = 420;
  const scaleX = (svgW - padding * 2) / rangeX;
  const scaleY = (svgH - padding * 2) / rangeY;
  const scale = Math.min(scaleX, scaleY);

  const svgPoints = meterCoords.map(c => ({
    x: padding + (c.x - minX) * scale,
    y: svgH - padding - (c.y - minY) * scale,
  }));
  const polyPointsStr = svgPoints.map(p => `${p.x},${p.y}`).join(' ');

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
    const offsetX = (dx / len) * 16;
    const offsetY = (dy / len) * 16;

    return `<text x="${mx + offsetX}" y="${my + offsetY}"
      text-anchor="middle" font-size="12"
      fill="#c2410c" font-weight="600">${dist.toFixed(1)}m</text>`;
  }).join('');

  const dots = svgPoints.map(p =>
    `<circle cx="${p.x}" cy="${p.y}" r="5" fill="#ea580c"/>`
  ).join('');

  const rW = rectWidthM * scale;
  const rH = rectDepthM * scale;
  const centerX = padding + (rangeX / 2) * scale;
  const centerY = svgH - padding - (rangeY / 2) * scale;

  const rectX = centerX - rW / 2;
  const rectY = centerY - rH / 2;
  const rectSvgW = rW;
  const rectSvgH = rH;

  const rectLabelW = `<text x="${rectX + rectSvgW / 2}" y="${rectY - 8}"
    text-anchor="middle" font-size="12" fill="#1d4ed8" font-weight="700"
    >${rectWidthM.toFixed(1)}m</text>`;
  const rectLabelH = `<text x="${rectX + rectSvgW + 10}" y="${rectY + rectSvgH / 2}"
    text-anchor="start" font-size="12" fill="#1d4ed8" font-weight="700"
    dominant-baseline="middle">${rectDepthM.toFixed(1)}m</text>`;

  const streetArrow = (() => {
    switch (streetSide) {
      case "South":
        return `<text x="${svgW / 2}" y="${svgH - 8}" text-anchor="middle" font-size="13" fill="#16a34a" font-weight="700">▼ Street / الشارع</text>`;
      case "North":
        return `<text x="${svgW / 2}" y="18" text-anchor="middle" font-size="13" fill="#16a34a" font-weight="700">▲ Street / الشارع</text>`;
      case "East":
        return `<text x="${svgW - 10}" y="${svgH / 2}" text-anchor="end" font-size="13" fill="#16a34a" font-weight="700">Street ▶</text>`;
      case "West":
        return `<text x="10" y="${svgH / 2}" text-anchor="start" font-size="13" fill="#16a34a" font-weight="700">◀ Street</text>`;
      default:
        return '';
    }
  })();

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
      <polygon points="${polyPointsStr}"
        fill="#fff7ed" stroke="#ea580c" stroke-width="2.5"/>
      ${dots}
      ${sideLabels}
      <rect x="${rectX}" y="${rectY}"
        width="${rectSvgW}" height="${rectSvgH}"
        fill="#dbeafe" fill-opacity="0.5"
        stroke="#1d4ed8" stroke-width="2"
        stroke-dasharray="6,3"/>
      ${rectLabelW}
      ${rectLabelH}
      ${streetArrow}
    </svg>`;
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
  const [buildableRect, setBuildableRect] = useState<{
    rectWidthM: number;
    rectDepthM: number;
    rectAreaM2: number;
    landAreaM2: number;
    maxBuildableM2: number;
    adjustedForCoverage: boolean;
  } | null>(null);
  const [buildingStats, setBuildingStats] = useState<{ maxHeightM: number; maxFloors: number }>({ maxHeightM: 0, maxFloors: 0 });
  const [isSmallPlot, setIsSmallPlot] = useState<boolean>(false);
  const [polygonSVG, setPolygonSVG] = useState<string>('');

  const handlePolygonComplete = useCallback((coords: [number, number][], area: number, _streetSideDetected: Direction8) => {
    setCoordinates(coords);
    setAreaM2(area);
    setHasPolygon(true);

    // Use new bearing-based auto-detection
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
  }, []);

  // Run all calculations when inputs change
  useEffect(() => {
    if (coordinates.length < 3 || !streetWidth || !streetSide) return;

    const coordsArr = coordinates.map(([lat, lng]) => [lat, lng]);

    const rect = calculateBuildableRectangle(coordsArr, streetSide);
    setBuildableRect(rect);

    const stats = calculateBuildingStats(streetWidth);
    setBuildingStats(stats);

    setIsSmallPlot(rect.landAreaM2 < 110);

    const svg = buildOverlaySVG(coordsArr, rect.rectWidthM, rect.rectDepthM, streetSide);
    setPolygonSVG(svg);
  }, [coordinates, streetSide, streetWidth]);

  const handleStreetSideChange = useCallback((side: string) => {
    setStreetSide(side);
  }, []);

  const handleStreetWidthChange = useCallback((width: number) => {
    setStreetWidth(width);
  }, []);

  const handleSubmit = (data: FormData) => {
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

              {/* Polygon + Rectangle Overlay Preview Card */}
              {hasPolygon && polygonSVG && (
                <PolygonPreviewCard svgContent={polygonSVG} vertexCount={coordinates.length} />
              )}

              {/* Calculations Panel */}
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
