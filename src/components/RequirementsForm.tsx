import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle } from "lucide-react";
import StepperInput from "./StepperInput";
import { Badge } from "@/components/ui/badge";

export type OutdoorType = "front_yard" | "courtyard" | "none";

export interface FormData {
  streetSide: string;
  streetWidth: number;
  rooms: number;
  outdoorType: OutdoorType;
  includeOffice: boolean;
}

interface RequirementsFormProps {
  hasPolygon: boolean;
  onSubmit: (data: FormData) => void;
  isLoading: boolean;
  detectedStreetSide?: string;
  isSmallPlot?: boolean;
  isMicroPlot?: boolean;
  onStreetSideChange?: (side: string) => void;
  onStreetWidthChange?: (width: number) => void;
  onOutdoorChange?: (value: OutdoorType) => void;
  currentState?: string;
}

const DIRECTIONS = [
  { value: "North", label: "North / الشمال" },
  { value: "North-East", label: "North-East / الشمال الشرقي" },
  { value: "East", label: "East / الشرق" },
  { value: "South-East", label: "South-East / الجنوب الشرقي" },
  { value: "South", label: "South / الجنوب" },
  { value: "South-West", label: "South-West / الجنوب الغربي" },
  { value: "West", label: "West / الغرب" },
  { value: "North-West", label: "North-West / الشمال الغربي" },
];

const stateLabels: Record<string, string> = {
  micro1: "Studio (< 40m²)",
  micro2: "Micro Unit (40–69m²)",
  small_front_yard: "2-Floor + Front Yard",
  small_no_outdoor: "2-Floor, No Outdoor",
  medium_front_yard: "Single Floor + Front Yard",
  medium_courtyard: "Single Floor + Courtyard",
  medium_no_outdoor: "Single Floor, No Outdoor",
  large_front_yard: "Large Home + Front Yard",
  large_courtyard: "Large Home + Courtyard",
  large_no_outdoor: "Large Home, No Outdoor",
  blocked_courtyard_small: "⚠️ Not available",
};

export default function RequirementsForm({
  hasPolygon,
  onSubmit,
  isLoading,
  detectedStreetSide,
  isSmallPlot = false,
  isMicroPlot = false,
  onStreetSideChange,
  onStreetWidthChange,
  onOutdoorChange,
  currentState = "",
}: RequirementsFormProps) {
  const [streetSide, setStreetSide] = useState("South");
  const [streetWidth, setStreetWidth] = useState(10);
  const [rooms, setRooms] = useState(3);
  const [outdoorType, setOutdoorType] = useState<OutdoorType>("front_yard");

  useEffect(() => {
    if (detectedStreetSide) {
      setStreetSide(detectedStreetSide);
    }
  }, [detectedStreetSide]);

  const handleStreetSideChange = (value: string) => {
    setStreetSide(value);
    onStreetSideChange?.(value);
  };

  const handleStreetWidthChange = (value: number) => {
    setStreetWidth(value);
    onStreetWidthChange?.(value);
  };

  const handleOutdoorChange = (value: OutdoorType) => {
    setOutdoorType(value);
    onOutdoorChange?.(value);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ streetSide, streetWidth, rooms, outdoorType, includeOffice: false });
  };

  const isStreetWidthValid = streetWidth > 0;
  const isBlocked = currentState === "blocked_courtyard_small";

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <h2 className="text-xl font-bold">Your Requirements / متطلباتك</h2>

      {/* Street Side */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium">Street Side / جهة الشارع</label>
        <Select value={streetSide} onValueChange={handleStreetSideChange}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DIRECTIONS.map((d) => (
              <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          {detectedStreetSide ? `Auto-detected: ${detectedStreetSide} — you can change this if needed` : "Which side of your land faces the main street?"}
        </p>
      </div>

      {/* Street Width */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium">Street Width (m) / عرض الشارع</label>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            value={streetWidth}
            onChange={(e) => handleStreetWidthChange(parseFloat(e.target.value) || 0)}
            placeholder="10"
            min="0"
            step="0.5"
          />
          <span className="text-sm text-muted-foreground whitespace-nowrap">meters / متر</span>
        </div>
        {!isStreetWidthValid && (
          <p className="text-xs text-destructive">Street width must be greater than 0</p>
        )}
      </div>

      {/* Bedrooms — conditional on plot size */}
      {isMicroPlot ? (
        <div className="rounded-lg border bg-accent/50 p-3">
          <p className="text-sm font-medium">
            🏢 AI will plan the layout automatically based on plot size
          </p>
          <p className="text-xs text-muted-foreground mt-1" dir="rtl">
            الذكاء الاصطناعي سيخطط التصميم تلقائياً بناءً على حجم القطعة
          </p>
        </div>
      ) : isSmallPlot ? (
        <div className="rounded-lg border bg-accent/50 p-3">
          <p className="text-sm font-medium">
            🏢 Small plot — AI will plan a two-floor layout automatically
          </p>
          <p className="text-xs text-muted-foreground mt-1" dir="rtl">
            مساحة صغيرة — الذكاء الاصطناعي سيخطط تلقائياً
          </p>
        </div>
      ) : (
        <StepperInput value={rooms} onChange={setRooms} min={2} max={5} label="Bedrooms" labelAr="غرف النوم" />
      )}

      {/* Outdoor Space */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium">Outdoor Space / المساحة الخارجية</label>
        <div className="grid grid-cols-3 gap-2">
          {[
            { value: "front_yard" as OutdoorType, label: "Front Yard", labelAr: "فناء أمامي" },
            { value: "courtyard" as OutdoorType, label: "Courtyard", labelAr: "فناء داخلي" },
            { value: "none" as OutdoorType, label: "No Outdoor", labelAr: "بدون" },
          ].map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => handleOutdoorChange(opt.value)}
              className={`rounded-lg border p-2 text-center text-xs transition ${
                outdoorType === opt.value
                  ? "border-primary bg-primary/10 font-semibold"
                  : "border-muted hover:bg-accent"
              }`}
            >
              <div>{opt.label}</div>
              <div className="text-muted-foreground" dir="rtl">{opt.labelAr}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Blocked state warning */}
      {currentState === "blocked_courtyard_small" && (
        <div className="rounded-lg border border-yellow-400 bg-yellow-50 p-3 flex items-start gap-2">
          <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium text-yellow-800">
              📐 The plot is too small for an indoor courtyard. Choose Front Yard or No Outdoor instead.
            </p>
            <p className="text-xs text-yellow-700 mt-1" dir="rtl">
              القطعة صغيرة جداً لفناء داخلي. اختر فناء أمامي أو بدون مساحة خارجية.
            </p>
          </div>
        </div>
      )}

      {/* State Badge */}
      {currentState && (
        <div className="text-xs text-muted-foreground text-center mb-2">
          Design Type / نوع التصميم:{" "}
          <Badge variant={isBlocked ? "destructive" : "secondary"} className="ml-1">
            {stateLabels[currentState] || "—"}
          </Badge>
        </div>
      )}

      {/* Submit */}
      <Button
        type="submit"
        size="lg"
        className="w-full"
        disabled={!hasPolygon || isLoading || !isStreetWidthValid || isBlocked}
        title={!hasPolygon ? "Please draw your land boundary on the map first" : !isStreetWidthValid ? "Enter a valid street width" : isBlocked ? "This combination is not available" : undefined}
      >
        {isLoading ? "Generating..." : "Generate Floor Plan / توليد المخطط"}
      </Button>
      {!hasPolygon && (
        <p className="text-xs text-muted-foreground text-center">
          Please draw your land boundary on the map first
        </p>
      )}
    </form>
  );
}
