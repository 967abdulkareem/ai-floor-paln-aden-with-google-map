import { useState, useCallback } from "react";
import { Link } from "react-router-dom";
import LandMap, { type Direction8 } from "@/components/LandMapStable";
import RequirementsForm, { type FormData } from "@/components/RequirementsForm";
import type { FloorPlanFormData } from "@/lib/api";
import TrialResult from "@/components/TrialResult";

export default function Generator() {
  const [coordinates, setCoordinates] = useState<[number, number][]>([]);
  const [areaM2, setAreaM2] = useState(0);
  const [hasPolygon, setHasPolygon] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [detectedStreetSide, setDetectedStreetSide] = useState<Direction8 | undefined>();
  const [submittedFormData, setSubmittedFormData] = useState<FloorPlanFormData | null>(null);

  const handlePolygonComplete = useCallback((coords: [number, number][], area: number, streetSide: Direction8) => {
    setCoordinates(coords);
    setAreaM2(area);
    setHasPolygon(true);
    setDetectedStreetSide(streetSide);
  }, []);

  const handlePolygonCleared = useCallback(() => {
    setCoordinates([]);
    setAreaM2(0);
    setHasPolygon(false);
    setDetectedStreetSide(undefined);
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
            Munasib <span className="text-muted-foreground">/ مناسب</span>
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
            <div className="lg:col-span-3">
              <h2 className="text-lg font-semibold mb-3">Draw Your Land / ارسم أرضك</h2>
              <LandMap
                onPolygonComplete={handlePolygonComplete}
                onPolygonCleared={handlePolygonCleared}
              />
            </div>
            <div className="lg:col-span-2">
              <RequirementsForm
                hasPolygon={hasPolygon}
                onSubmit={handleSubmit}
                isLoading={false}
                detectedStreetSide={detectedStreetSide}
              />
            </div>
          </div>
        )}
      </main>

      <footer className="border-t py-4">
        <p className="text-center text-xs text-muted-foreground px-4">
          Developed as part of academic research on AI-assisted architectural design for developing countries | Sana'a, Yemen
        </p>
      </footer>
    </div>
  );
}
