import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet-draw";
import "leaflet-draw/dist/leaflet.draw.css";
import { Map, Layers } from "lucide-react";

const SANAA_CENTER: L.LatLngExpression = [15.3694, 44.191];

const DIRECTIONS_8 = ["North", "North-East", "East", "South-East", "South", "South-West", "West", "North-West"] as const;
export type Direction8 = typeof DIRECTIONS_8[number];

function computeArea(latlngs: L.LatLng[]): number {
  if (latlngs.length < 3) return 0;
  const centroid = latlngs.reduce(
    (acc, ll) => ({ lat: acc.lat + ll.lat / latlngs.length, lng: acc.lng + ll.lng / latlngs.length }),
    { lat: 0, lng: 0 }
  );
  const toMeters = (ll: L.LatLng) => {
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

function detectStreetSide(latlngs: L.LatLng[]): Direction8 {
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
  const normalized = ((angle + 360 + 22.5) % 360);
  const idx = Math.floor(normalized / 45);
  const dirMap: Direction8[] = ["East", "North-East", "North", "North-West", "West", "South-West", "South", "South-East"];
  return dirMap[idx] || "South";
}

interface LandMapProps {
  onPolygonComplete: (coords: [number, number][], areaM2: number, streetSide: Direction8) => void;
  onPolygonCleared: () => void;
}

export default function LandMap({ onPolygonComplete, onPolygonCleared }: LandMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const drawnItemsRef = useRef<L.FeatureGroup>(new L.FeatureGroup());
  const [landInfo, setLandInfo] = useState<{ area: number; points: number; streetSide: Direction8 } | null>(null);
  const [mapMode, setMapMode] = useState<"satellite" | "street" | "hybrid">("satellite");
  const satelliteLayerRef = useRef<L.TileLayer | null>(null);
  const streetLayerRef = useRef<L.TileLayer | null>(null);
  const labelsLayerRef = useRef<L.TileLayer | null>(null);

  const clearPolygon = useCallback(() => {
    drawnItemsRef.current.clearLayers();
    setLandInfo(null);
    onPolygonCleared();
  }, [onPolygonCleared]);

  const removeLayers = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    if (satelliteLayerRef.current) map.removeLayer(satelliteLayerRef.current);
    if (streetLayerRef.current) map.removeLayer(streetLayerRef.current);
    if (labelsLayerRef.current) map.removeLayer(labelsLayerRef.current);
  }, []);

  const getSatelliteLayer = () => {
    if (!satelliteLayerRef.current) {
      satelliteLayerRef.current = L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        { attribution: "Tiles © Esri", maxZoom: 20 }
      );
    }
    return satelliteLayerRef.current;
  };

  const getStreetLayer = () => {
    if (!streetLayerRef.current) {
      streetLayerRef.current = L.tileLayer(
        "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        { attribution: "© OpenStreetMap contributors", maxZoom: 20 }
      );
    }
    return streetLayerRef.current;
  };

  const getLabelsLayer = () => {
    if (!labelsLayerRef.current) {
      labelsLayerRef.current = L.tileLayer(
        "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        { maxZoom: 20, opacity: 0.4 }
      );
    }
    return labelsLayerRef.current;
  };

  const toggleMapView = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    removeLayers();

    if (mapMode === "satellite") {
      // -> street
      getStreetLayer().addTo(map);
      setMapMode("street");
    } else if (mapMode === "street") {
      // -> hybrid (satellite + labels)
      getSatelliteLayer().addTo(map);
      getLabelsLayer().addTo(map);
      setMapMode("hybrid");
    } else {
      // -> satellite
      getSatelliteLayer().addTo(map);
      setMapMode("satellite");
    }
  }, [mapMode, removeLayers]);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: SANAA_CENTER,
      zoom: 18,
      zoomControl: true,
    });
    mapRef.current = map;

    // Default: satellite
    satelliteLayerRef.current = L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      { attribution: "Tiles © Esri", maxZoom: 20 }
    ).addTo(map);

    L.control.scale({ imperial: false, metric: true, position: "bottomleft" }).addTo(map);

    drawnItemsRef.current.addTo(map);

    const polygonStyle = {
      color: "#FF6B35",
      fillColor: "#FF6B35",
      fillOpacity: 0.15,
      weight: 2,
      opacity: 0.9,
    };

    const drawControl = new L.Control.Draw({
      position: "topright",
      draw: {
        polygon: { allowIntersection: false, shapeOptions: polygonStyle },
        rectangle: { shapeOptions: polygonStyle },
        circle: false,
        circlemarker: false,
        marker: false,
        polyline: false,
      },
      edit: {
        featureGroup: drawnItemsRef.current,
        remove: true,
        edit: {} as any,
      },
    });
    map.addControl(drawControl);

    map.on(L.Draw.Event.CREATED, (e: any) => {
      drawnItemsRef.current.clearLayers();
      const layer = e.layer as L.Polygon;
      drawnItemsRef.current.addLayer(layer);
      const latlngs = layer.getLatLngs()[0] as L.LatLng[];
      const coords: [number, number][] = latlngs.map((ll) => [ll.lat, ll.lng]);
      const areaM2 = computeArea(latlngs);
      const streetSide = detectStreetSide(latlngs);
      setLandInfo({ area: Math.round(areaM2 * 100) / 100, points: coords.length, streetSide });
      onPolygonComplete(coords, areaM2, streetSide);
    });

    map.on(L.Draw.Event.EDITED, (e: any) => {
      const layers = e.layers as L.LayerGroup;
      layers.eachLayer((layer: any) => {
        const latlngs = layer.getLatLngs()[0] as L.LatLng[];
        const coords: [number, number][] = latlngs.map((ll: L.LatLng) => [ll.lat, ll.lng]);
        const areaM2 = computeArea(latlngs);
        const streetSide = detectStreetSide(latlngs);
        setLandInfo({ area: Math.round(areaM2 * 100) / 100, points: coords.length, streetSide });
        onPolygonComplete(coords, areaM2, streetSide);
      });
    });

    map.on(L.Draw.Event.DELETED, () => {
      if (drawnItemsRef.current.getLayers().length === 0) {
        setLandInfo(null);
        onPolygonCleared();
      }
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-3">
      <div className="relative">
        <div
          ref={mapContainerRef}
          className="rounded-lg overflow-hidden border"
          style={{ width: "100%", height: "500px" }}
        />
        {/* Map layer toggle button */}
        <Button
          variant="secondary"
          size="sm"
          className="absolute top-3 left-3 z-[1000] shadow-md gap-1.5"
          onClick={toggleMapView}
        >
          <Layers className="h-4 w-4" />
          {mapMode === "satellite" ? "Street" : mapMode === "street" ? "Hybrid" : "Satellite"}
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
