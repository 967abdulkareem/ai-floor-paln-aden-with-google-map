import { useState, useCallback, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import LandMap, { type Direction8 } from "@/components/LandMapStable";
import RequirementsForm, { type FormData } from "@/components/RequirementsForm";
import type { FloorPlanFormData } from "@/lib/api";
import TrialResult from "@/components/TrialResult";
import PolygonPreviewCard from "@/components/PolygonPreviewCard";
import CalculationsPanel from "@/components/CalculationsPanel";

// --- Utility functions (client-side only) ---

const buildPolygonSVG = (coords: number[][]): string => {
  const refLat = coords[0][0];
  const refLng = coords[0][1];

  const meterCoords = coords.map(([lat, lng]) => ({
    x: (lng - refLng) * 111320 * Math.cos((refLat * Math.PI) / 180),
    y: (lat - refLat) * 110540,
  }));

  const xs = meterCoords.map(c => c.x);
  const ys = meterCoords.map(c => c.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;

  const padding = 60;
  const svgW = 700, svgH = 400;
  const scaleX = (svgW - padding * 2) / rangeX;
  const scaleY = (svgH - padding * 2) / rangeY;
  const scale = Math.min(scaleX, scaleY);

  const svgPoints = meterCoords.map(c => ({
    x: padding + (c.x - minX) * scale,
    y: svgH - padding - (c.y - minY) * scale,
  }));

  const pointsStr = svgPoints.map(p => `${p.x},${p.y}`).join(' ');

  const sideLabels = svgPoints.map((p, i) => {
    const next = svgPoints[(i + 1) % svgPoints.length];
    const mx = (p.x + next.x) / 2;
    const my = (p.y + next.y) / 2;
    const m1 = meterCoords[i];
    const m2 = meterCoords[(i + 1) % meterCoords.length];
    const dist = Math.sqrt((m2.x - m1.x) ** 2 + (m2.y - m1.y) ** 2);
    return `<text x="${mx}" y="${my - 6}" text-anchor="middle" font-size="13" fill="#c2410c" font-weight="600">${dist.toFixed(1)}m</text>`;
  }).join('');

  return `<svg viewBox="0 0 ${svgW} ${svgH}" xmlns="http://www.w3.org/2000/svg">
      <polygon points="${pointsStr}" fill="#fff7ed" stroke="#ea580c" stroke-width="2.5"/>
      ${svgPoints.map(p => `<circle cx="${p.x}" cy="${p.y}" r="5" fill="#ea580c"/>`).join('')}
      ${sideLabels}
    </svg>`;
};

const calculateBuildableRectangle = (
  coords: number[][],
  streetSide: string,
): {
  rectWidthM: number;
  rectDepthM: number;
  rectAreaM2: number;
  adjustedForCoverage: boolean;
} => {
  const refLat = coords[0][0];
  const refLng = coords[0][1];

  const meterCoords = coords.map(([lat, lng]) => ({
    x: (lng - refLng) * 111320 * Math.cos((refLat * Math.PI) / 180),
    y: (lat - refLat) * 110540,
  }));

  const xs = meterCoords.map(c => c.x);
  const ys = meterCoords.map(c => c.y);
  const totalW = Math.max(...xs) - Math.min(...xs);
  const totalH = Math.max(...ys) - Math.min(...ys);

  const setback = 1;
  let rectW = totalW;
  let rectH = totalH;

  if (streetSide === "North" || streetSide === "South") {
    rectW -= setback * 2;
    rectH -= setback;
  } else {
    rectH -= setback * 2;
    rectW -= setback;
  }

  const landAreaM2 = totalW * totalH;
  const maxBuildable = landAreaM2 * 0.70;
  let rectArea = rectW * rectH;
  let adjusted = false;

  if (rectArea > maxBuildable) {
    adjusted = true;
    if (rectW >= rectH) {
      rectW = maxBuildable / rectH;
    } else {
      rectH = maxBuildable / rectW;
    }
    rectArea = rectW * rectH;
  }

  return {
    rectWidthM: Math.round(rectW * 10) / 10,
    rectDepthM: Math.round(rectH * 10) / 10,
    rectAreaM2: Math.round(rectArea * 10) / 10,
    adjustedForCoverage: adjusted,
  };
};

const calculateBuildingHeight = (
  streetWidth: number,
): number => {
  const setbackSum = 3;
  return streetWidth + setbackSum;
};

export default function Generator() {
  const [coordinates, setCoordinates] = useState<[number, number][]>([]);
  const [areaM2, setAreaM2] = useState(0);
  const [hasPolygon, setHasPolygon] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [detectedStreetSide, setDetectedStreetSide] = useState<Direction8 | undefined>();
  const [submittedFormData, setSubmittedFormData] = useState<FloorPlanFormData | null>(null);

  // New state
  const [streetSide, setStreetSide] = useState<string>("South");
  const [streetWidth, setStreetWidth] = useState<number>(10);
  const [buildableRect, setBuildableRect] = useState<{
    rectWidthM: number;
    rectDepthM: number;
    rectAreaM2: number;
    adjustedForCoverage: boolean;
  } | null>(null);
  const [buildingHeightM, setBuildingHeightM] = useState<number>(0);
  const [isSmallPlot, setIsSmallPlot] = useState<boolean>(false);
  const [polygonSVG, setPolygonSVG] = useState<string>('');

  const handlePolygonComplete = useCallback((coords: [number, number][], area: number, streetSideDetected: Direction8) => {
    setCoordinates(coords);
    setAreaM2(area);
    setHasPolygon(true);
    setDetectedStreetSide(streetSideDetected);
    setStreetSide(streetSideDetected);
  }, []);

  const handlePolygonCleared = useCallback(() => {
    setCoordinates([]);
    setAreaM2(0);
    setHasPolygon(false);
    setDetectedStreetSide(undefined);
    setBuildableRect(null);
    setBuildingHeightM(0);
    setIsSmallPlot(false);
    setPolygonSVG('');
  }, []);

  // Run all calculations when inputs change
  useEffect(() => {
    if (coordinates.length < 3 || !streetWidth || !streetSide) return;

    const coordsArr = coordinates.map(([lat, lng]) => [lat, lng]);

    const svg = buildPolygonSVG(coordsArr);
    setPolygonSVG(svg);

    const rect = calculateBuildableRectangle(coordsArr, streetSide);
    setBuildableRect(rect);

    const height = calculateBuildingHeight(streetWidth);
    setBuildingHeightM(height);

    setIsSmallPlot(areaM2 < 110);
  }, [coordinates, streetSide, streetWidth, areaM2]);

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

              {/* Polygon Preview Card */}
              {hasPolygon && polygonSVG && (
                <PolygonPreviewCard svgContent={polygonSVG} vertexCount={coordinates.length} />
              )}

              {/* Calculations Panel */}
              {hasPolygon && buildableRect && (
                <CalculationsPanel
                  areaM2={areaM2}
                  buildableRect={buildableRect}
                  buildingHeightM={buildingHeightM}
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