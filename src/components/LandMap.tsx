import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { GoogleMap, DrawingManager } from "@react-google-maps/api";
import { Layers } from "lucide-react";

const DIRECTIONS_8 = ["North", "North-East", "East", "South-East", "South", "South-West", "West", "North-West"] as const;
export type Direction8 = (typeof DIRECTIONS_8)[number];

const GOOGLE_MAPS_API_KEY = "AIzaSyDvkqZ9qd5kNp60pLt_qY5YMSb8xB88bs4";

function computeArea(path: google.maps.LatLng[]): number {
  return google.maps.geometry
    ? google.maps.geometry.spherical.computeArea(path)
    : manualComputeArea(path);
}

function manualComputeArea(path: google.maps.LatLng[]): number {
  if (path.length < 3) return 0;
  const latlngs = path.map((p) => ({ lat: p.lat(), lng: p.lng() }));
  const centroid = latlngs.reduce(
    (acc, ll) => ({ lat: acc.lat + ll.lat / latlngs.length, lng: acc.lng + ll.lng / latlngs.length }),
    { lat: 0, lng: 0 }
  );
  const toMeters = (ll: { lat: number; lng: number }) => {
    const R = 6371000;
    const dLat = ((ll.lat - centroid.lat) * Math.PI) / 180;
    const dLng = ((ll.lng - centroid.lng) * Math.PI) / 180;
    const y = dLat * R;
    const x = dLng * R * Math.cos((centroid.lat * Math.PI) / 180);
    return { x, y };
  };
  const pts = latlngs.map(toMeters);
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    area += pts[i].x * pts[j].y;
    area -= pts[j].x * pts[i].y;
  }
  return Math.abs(area / 2);
}

function detectStreetSide(path: google.maps.LatLng[]): Direction8 {
  const latlngs = path.map((p) => ({ lat: p.lat(), lng: p.lng() }));
  if (latlngs.length < 3) return "South";
  const centroid = latlngs.reduce(
    (acc, ll) => ({ lat: acc.lat + ll.lat / latlngs.length, lng: acc.lng + ll.lng / latlngs.length }),
    { lat: 0, lng: 0 }
  );
  let bestEdge = 0;
  let bestDist = 0;
  for (let i = 0; i < latlngs.length; i++) {
    const j = (i + 1) % latlngs.length;
    const midLat = (latlngs[i].lat + latlngs[j].lat) / 2;
    const midLng = (latlngs[i].lng + latlngs[j].lng) / 2;
    const dist = Math.sqrt((midLat - centroid.lat) ** 2 + (midLng - centroid.lng) ** 2);
    if (dist > bestDist) {
      bestDist = dist;
      bestEdge = i;
    }
  }
  const j = (bestEdge + 1) % latlngs.length;
  const midLat = (latlngs[bestEdge].lat + latlngs[j].lat) / 2;
  const midLng = (latlngs[bestEdge].lng + latlngs[j].lng) / 2;
  const angle = Math.atan2(midLat - centroid.lat, midLng - centroid.lng) * (180 / Math.PI);
  const normalized = (angle + 360 + 22.5) % 360;
  const idx = Math.floor(normalized / 45);
  const dirMap: Direction8[] = ["East", "North-East", "North", "North-West", "West", "South-West", "South", "South-East"];
  return dirMap[idx] || "South";
}

const polygonOptions: google.maps.PolygonOptions = {
  fillColor: "#FF6B35",
  fillOpacity: 0.15,
  strokeColor: "#FF6B35",
  strokeOpacity: 0.9,
  strokeWeight: 2,
  editable: true,
  draggable: false,
};

interface LandMapProps {
  onPolygonComplete: (coords: [number, number][], areaM2: number, streetSide: Direction8) => void;
  onPolygonCleared: () => void;
}

type MapTypeId = "satellite" | "roadmap" | "hybrid";

export default function LandMap({ onPolygonComplete, onPolygonCleared }: LandMapProps) {
  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
    libraries: LIBRARIES,
  });

  const mapRef = useRef<google.maps.Map | null>(null);
  const polygonRef = useRef<google.maps.Polygon | null>(null);
  const [landInfo, setLandInfo] = useState<{ area: number; points: number; streetSide: Direction8 } | null>(null);
  const [mapTypeId, setMapTypeId] = useState<MapTypeId>("satellite");
  const [polygonPath, setPolygonPath] = useState<google.maps.LatLngLiteral[] | null>(null);

  const processPolygon = useCallback(
    (path: google.maps.LatLng[]) => {
      const coords: [number, number][] = path.map((p) => [p.lat(), p.lng()]);
      const areaM2 = computeArea(path);
      const streetSide = detectStreetSide(path);
      setLandInfo({ area: Math.round(areaM2 * 100) / 100, points: coords.length, streetSide });
      setPolygonPath(path.map((p) => ({ lat: p.lat(), lng: p.lng() })));
      onPolygonComplete(coords, areaM2, streetSide);
    },
    [onPolygonComplete]
  );

  const onPolygonCompleteHandler = useCallback(
    (polygon: google.maps.Polygon) => {
      // Remove previous polygon
      if (polygonRef.current) {
        polygonRef.current.setMap(null);
      }
      polygonRef.current = polygon;

      const path = polygon.getPath();
      processPolygon(path.getArray());

      // Listen for edits
      const updateHandler = () => {
        const updatedPath = polygon.getPath();
        processPolygon(updatedPath.getArray());
      };
      google.maps.event.addListener(path, "set_at", updateHandler);
      google.maps.event.addListener(path, "insert_at", updateHandler);
      google.maps.event.addListener(path, "remove_at", updateHandler);

      // Hide the drawing manager overlay polygon (we manage our own)
      polygon.setOptions(polygonOptions);
    },
    [processPolygon]
  );

  const clearPolygon = useCallback(() => {
    if (polygonRef.current) {
      polygonRef.current.setMap(null);
      polygonRef.current = null;
    }
    setPolygonPath(null);
    setLandInfo(null);
    onPolygonCleared();
  }, [onPolygonCleared]);

  const toggleMapView = useCallback(() => {
    setMapTypeId((prev) => {
      if (prev === "satellite") return "roadmap";
      if (prev === "roadmap") return "hybrid";
      return "satellite";
    });
  }, []);

  const onMapLoad = useCallback((map: google.maps.Map) => {
    mapRef.current = map;
  }, []);

  if (loadError) {
    return (
      <div className="rounded-lg border p-8 text-center text-destructive">
        <p className="font-semibold">Failed to load Google Maps</p>
        <p className="text-sm text-muted-foreground mt-1">
          Please check your API key (VITE_GOOGLE_MAPS_API_KEY) and ensure Maps JavaScript API & Drawing library are enabled.
        </p>
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className="rounded-lg border flex items-center justify-center" style={{ height: 500 }}>
        <p className="text-muted-foreground">Loading map…</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <GoogleMap
          mapContainerClassName="rounded-lg overflow-hidden border"
          mapContainerStyle={{ width: "100%", height: "500px" }}
          center={SANAA_CENTER}
          zoom={18}
          mapTypeId={mapTypeId}
          onLoad={onMapLoad}
          options={{
            scaleControl: true,
            mapTypeControl: false,
            fullscreenControl: false,
            streetViewControl: false,
          }}
        >
          <DrawingManager
            options={{
              drawingControl: true,
              drawingControlOptions: {
                position: google.maps.ControlPosition.TOP_RIGHT,
                drawingModes: [google.maps.drawing.OverlayType.POLYGON],
              },
              polygonOptions,
            }}
            onPolygonComplete={onPolygonCompleteHandler}
          />
        </GoogleMap>

        <Button
          variant="secondary"
          size="sm"
          className="absolute top-3 left-3 z-[5] shadow-md gap-1.5"
          onClick={toggleMapView}
        >
          <Layers className="h-4 w-4" />
          {mapTypeId === "satellite" ? "Street" : mapTypeId === "roadmap" ? "Hybrid" : "Satellite"}
        </Button>
      </div>

      {landInfo && (
        <div className="bg-accent/50 rounded-lg p-4 space-y-1 text-sm">
          <p>
            <span className="font-semibold">Land Area / مساحة الأرض:</span>{" "}
            {landInfo.area.toFixed(1)} m²
          </p>
          <p>
            <span className="font-semibold">Maximum Buildable Area / أقصى مساحة بناء:</span>{" "}
            {(landInfo.area * 0.7).toFixed(1)} m² (70%)
          </p>
          <p>
            <span className="font-semibold">Detected Street Side / جهة الشارع:</span>{" "}
            {landInfo.streetSide}
          </p>
          <p className="text-success">
            ✅ Coordinates captured: {landInfo.points} points
          </p>
        </div>
      )}

      <Button variant="outline" size="sm" onClick={clearPolygon}>
        Clear and Redraw / مسح وإعادة الرسم
      </Button>
    </div>
  );
}
