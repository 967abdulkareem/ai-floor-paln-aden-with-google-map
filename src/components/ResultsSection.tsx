import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Download, ExternalLink, RotateCcw } from "lucide-react";
import { getFullUrl, type GenerateResponse } from "@/lib/api";

interface ResultsSectionProps {
  result: GenerateResponse;
  rooms: number;
  bathrooms: number;
  includeDiwan: boolean;
  onReset: () => void;
}

export default function ResultsSection({ result, rooms, bathrooms, includeDiwan, onReset }: ResultsSectionProps) {
  const imageUrl = getFullUrl(result.image_url);
  const dxfUrl = getFullUrl(result.dxf_url);

  const handleDownloadDxf = () => {
    const a = document.createElement("a");
    a.href = dxfUrl;
    a.download = "floor_plan.dxf";
    a.click();
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Floor Plan Preview */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Floor Plan Preview / معاينة المخطط</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <img
              src={imageUrl}
              alt="AI-generated floor plan"
              className="w-full rounded-md border"
            />
            <div className="flex gap-2">
              <Button variant="outline" size="sm" asChild>
                <a href={imageUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4 mr-1" /> View Full Size
                </a>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <a href={imageUrl} download="floor_plan.png">
                  <Download className="h-4 w-4 mr-1" /> Download PNG
                </a>
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              AI-generated floor plan — for review by a licensed architect before construction
            </p>
          </CardContent>
        </Card>

        {/* CAD File */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">CAD File / ملف CAD</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center justify-center space-y-4 py-8">
            <span className="text-6xl">📐</span>
            <Button onClick={handleDownloadDxf}>
              <Download className="h-4 w-4 mr-2" /> Download DXF File
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              Open this file in AutoCAD, FreeCAD, or LibreCAD to edit the floor plan
            </p>
            <p className="text-xs text-muted-foreground text-center">
              DXF files contain editable room geometry on separate layers
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Summary */}
      <Card>
        <CardContent className="pt-6 space-y-2 text-sm">
          <p><span className="font-semibold">Land Area:</span> {result.land_area_m2.toFixed(1)} m²</p>
          <p><span className="font-semibold">Built Area:</span> {result.max_buildable_m2.toFixed(1)} m² ({((result.max_buildable_m2 / result.land_area_m2) * 100).toFixed(0)}%)</p>
          <p>
            <span className="font-semibold">Rooms:</span> {rooms} bedrooms, {bathrooms} bathrooms, kitchen, living room
            {includeDiwan ? ", Diwan" : ""}
          </p>
          <p className="text-success font-medium">
            ✅ Generated to comply with Aden building regulations
          </p>
        </CardContent>
      </Card>

      <Button variant="outline" onClick={onReset} className="w-full">
        <RotateCcw className="h-4 w-4 mr-2" /> Generate Another Plan / توليد مخطط آخر
      </Button>
    </div>
  );
}
