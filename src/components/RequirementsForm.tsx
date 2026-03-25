import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Info } from "lucide-react";
import StepperInput from "./StepperInput";
import { Badge } from "@/components/ui/badge";

export interface FormData {
  streetSide: string;
  streetWidth: number;
  rooms: number;
  bathrooms: number;
  includeDiwan: boolean;
  includeGarden: boolean;
  includeOffice: boolean;
  userName: string;
}

interface RequirementsFormProps {
  hasPolygon: boolean;
  onSubmit: (data: FormData) => void;
  isLoading: boolean;
  detectedStreetSide?: string;
  isSmallPlot?: boolean;
  onStreetSideChange?: (side: string) => void;
  onStreetWidthChange?: (width: number) => void;
  onDiwanChange?: (value: boolean) => void;
  onGardenChange?: (value: boolean) => void;
  currentState?: number;
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

export default function RequirementsForm({
  hasPolygon,
  onSubmit,
  isLoading,
  detectedStreetSide,
  isSmallPlot = false,
  onStreetSideChange,
  onStreetWidthChange,
  onDiwanChange,
  onGardenChange,
  currentState = 0,
}: RequirementsFormProps) {
  const [streetSide, setStreetSide] = useState("South");
  const [streetWidth, setStreetWidth] = useState(10);
  const [rooms, setRooms] = useState(3);
  const [bathrooms, setBathrooms] = useState(2);
  const [includeDiwan, setIncludeDiwan] = useState(true);
  const [includeGarden, setIncludeGarden] = useState(false);
  const [userName, setUserName] = useState("");

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

  const handleDiwanChange = (value: boolean) => {
    setIncludeDiwan(value);
    onDiwanChange?.(value);
  };

  const handleGardenChange = (value: boolean) => {
    setIncludeGarden(value);
    onGardenChange?.(value);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ streetSide, streetWidth, rooms, bathrooms, includeDiwan, includeGarden, includeOffice: false, userName });
  };

  const isStreetWidthValid = streetWidth > 0;

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

      {/* Street Width — free number input */}
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

      {/* Bedrooms & Bathrooms — conditional on plot size */}
      {isSmallPlot ? (
        <div className="rounded-lg border bg-accent/50 p-3">
          <p className="text-sm font-medium">
            🏢 Small plot — AI will plan a two-floor layout automatically
          </p>
          <p className="text-xs text-muted-foreground mt-1" dir="rtl">
            مساحة صغيرة — الذكاء الاصطناعي سيخطط تلقائياً
          </p>
        </div>
      ) : (
        <>
          <StepperInput value={rooms} onChange={setRooms} min={2} max={5} label="Bedrooms" labelAr="غرف النوم" />
          <StepperInput value={bathrooms} onChange={setBathrooms} min={1} max={4} label="Bathrooms" labelAr="الحمامات" />
        </>
      )}

      {/* Diwan */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Switch checked={includeDiwan} onCheckedChange={handleDiwanChange} />
          <span className="text-sm font-medium">Include Diwan (ديوان)</span>
          <Tooltip>
            <TooltipTrigger asChild>
              <Info className="h-4 w-4 text-muted-foreground cursor-help" />
            </TooltipTrigger>
            <TooltipContent className="max-w-xs text-xs">
              The Diwan is a traditional Yemeni reception room placed next to the entrance. It allows you to receive guests without them entering your family's private spaces. Highly recommended.
            </TooltipContent>
          </Tooltip>
        </div>
        {includeDiwan && (
          <p className="text-xs text-success">✅ Diwan will be placed next to the entrance</p>
        )}
      </div>

      {/* Garden */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Switch checked={includeGarden} onCheckedChange={handleGardenChange} />
          <span className="text-sm font-medium">Include Garden / حديقة</span>
          <Tooltip>
            <TooltipTrigger asChild>
              <Info className="h-4 w-4 text-muted-foreground cursor-help" />
            </TooltipTrigger>
            <TooltipContent className="max-w-xs text-xs">
              A private outdoor garden space within the plot.
            </TooltipContent>
          </Tooltip>
        </div>
        {includeGarden && (
          <p className="text-xs text-success">✅ Garden will be included in the layout</p>
        )}
      </div>

      {/* Name */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium">Your Name / الاسم (optional)</label>
        <Input
          value={userName}
          onChange={(e) => setUserName(e.target.value)}
          placeholder="For the title block of your floor plan"
        />
      </div>

      {/* State Badge */}
      {currentState > 0 && (
        <div className="text-xs text-muted-foreground text-center mb-2">
          Design Type / نوع التصميم: <Badge variant="secondary" className="ml-1">State {currentState}</Badge>
        </div>
      )}

      {/* Submit */}
      <Button
        type="submit"
        size="lg"
        className="w-full"
        disabled={!hasPolygon || isLoading || !isStreetWidthValid}
        title={!hasPolygon ? "Please draw your land boundary on the map first" : !isStreetWidthValid ? "Enter a valid street width" : undefined}
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
