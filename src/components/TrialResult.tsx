import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Download, RefreshCw, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { exportCad, type FloorPlanFormData } from "@/lib/api";

interface TrialResultProps {
  coordinates: [number, number][];
  formData: FloorPlanFormData;
  prompt: string;
  onReset: () => void;
}

export default function TrialResult({ coordinates, formData, prompt, onReset }: TrialResultProps) {
  const [isGenerating, setIsGenerating] = useState(true);
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runGeneration = async () => {
    setIsGenerating(true);
    setGeneratedImageUrl(null);
    setError(null);

    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (!apiKey) {
      setError("Gemini API key not configured. Set VITE_GEMINI_API_KEY.");
      setIsGenerating(false);
      return;
    }

    console.log("[TrialResult] Prompt being sent to Gemini:\n", prompt);

    try {
      const response = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-preview-image-generation:generateContent",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey,
          },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              responseModalities: ["IMAGE", "TEXT"],
            },
          }),
        }
      );

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error?.message || "Gemini API error");
      }

      const data = await response.json();
      const parts = data.candidates?.[0]?.content?.parts || [];

      let imageBase64: string | null = null;
      for (const part of parts) {
        if (part.inlineData?.mimeType?.startsWith("image/")) {
          imageBase64 = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
          break;
        }
      }

      if (!imageBase64) throw new Error("No image returned. Please try again.");

      setGeneratedImageUrl(imageBase64);
    } catch (err: any) {
      setError(err.message || "Generation failed. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  useEffect(() => {
    runGeneration();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRegenerate = () => runGeneration();

  const handleExportCAD = async () => {
    if (!generatedImageUrl) {
      alert("CAD export will be available after the AI generates the floor plan image.");
      return;
    }
    try {
      const result = await exportCad(generatedImageUrl);
      window.open(result.dxfUrl, "_blank");
    } catch (err) {
      alert((err as Error).message ?? "CAD export failed");
    }
  };

  if (isGenerating) {
    return (
      <div className="flex flex-col items-center justify-center py-16 space-y-6 px-4">
        <Loader2 className="h-12 w-12 text-primary animate-spin" />
        <div className="space-y-2 text-center">
          <p className="font-semibold">🗺️ Analyzing your land...</p>
          <p className="text-sm text-muted-foreground">🤖 Generating floor plan with AI...</p>
          <p className="text-xs text-muted-foreground">This usually takes 15–30 seconds</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto px-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base sm:text-lg">Generated Floor Plan / المخطط المُولَّد</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {generatedImageUrl ? (
            <img
              src={generatedImageUrl}
              alt="AI-generated floor plan"
              className="w-full rounded-md border"
            />
          ) : (
            <div className="w-full aspect-[4/3] rounded-md border bg-muted flex flex-col items-center justify-center gap-3 text-muted-foreground p-4">
              <span className="text-5xl sm:text-6xl">🏠</span>
              <p className="text-xs sm:text-sm text-center">
                Floor plan will appear here once the Gemini API is connected
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 text-xs sm:text-sm bg-accent/50 rounded-lg p-3">
            <p><span className="font-semibold">Area:</span> {formData.areaM2.toFixed(1)} m²</p>
            <p><span className="font-semibold">Street:</span> {formData.streetSide}</p>
            <p><span className="font-semibold">Rooms:</span> {formData.rooms} bedrooms</p>
            <p><span className="font-semibold">Diwan:</span> {formData.includeDiwan ? "Yes" : "No"}</p>
          </div>

          {error && (
            <p className="text-sm text-destructive text-center">{error}</p>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-col sm:flex-row gap-3">
        <Button size="lg" variant="outline" className="flex-1" onClick={handleRegenerate}>
          <RefreshCw className="h-4 w-4 mr-2" /> Regenerate / إعادة التوليد
        </Button>
        <Button size="lg" className="flex-1" onClick={handleExportCAD}>
          <Download className="h-4 w-4 mr-2" /> Export as CAD File
        </Button>
      </div>

      <Button variant="ghost" size="sm" onClick={onReset} className="w-full text-muted-foreground">
        ← Back to Editor / العودة للمحرر
      </Button>
    </div>
  );
}
