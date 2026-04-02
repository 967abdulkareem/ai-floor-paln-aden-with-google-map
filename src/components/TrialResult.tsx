import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Download, RefreshCw, Loader2, FileCode2, ChevronDown, ChevronUp } from "lucide-react";
import { useEffect, useState } from "react";
import { exportCad, type FloorPlanFormData } from "@/lib/api";

interface TrialResultProps {
  coordinates: [number, number][];
  formData: FloorPlanFormData;
  prompt: string;
  polygonSVG: string;
  vertexCount: number;
  longestSideAngleDeg: number;
  onReset: () => void;
}

export default function TrialResult({
  coordinates,
  formData,
  prompt,
  polygonSVG,
  vertexCount,
  longestSideAngleDeg,
  onReset,
}: TrialResultProps) {
  const [isGenerating, setIsGenerating] = useState(true);
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [editablePrompt, setEditablePrompt] = useState(prompt);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [rotateImage, setRotateImage] = useState(false);

  const runGeneration = async (customPrompt?: string) => {
    setIsGenerating(true);
    setGeneratedImageUrl(null);
    setError(null);

    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (!apiKey) {
      setError("Gemini API key not configured. Add VITE_GEMINI_API_KEY to Lovable environment variables.");
      setIsGenerating(false);
      return;
    }

    const promptToSend = customPrompt ?? editablePrompt;
    console.log("[TrialResult] Calling Gemini directly. Prompt:\n", promptToSend);

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
            contents: [{ parts: [{ text: promptToSend }] }],
            generationConfig: { responseModalities: ["IMAGE", "TEXT"] },
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
    setEditablePrompt(prompt);
    runGeneration(prompt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRegenerate = () => runGeneration();
  const handleRegenerateWithEditedPrompt = () => runGeneration(editablePrompt);

  const handleDownloadPNG = () => {
    if (!generatedImageUrl) return;
    const a = document.createElement("a");
    a.href = generatedImageUrl;
    a.download = "emmar-floor-plan.png";
    a.click();
  };

  const handleExportCAD = async () => {
    if (!generatedImageUrl) {
      alert("Please wait for the floor plan to generate first.");
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
      <div className="max-w-3xl mx-auto px-4 space-y-6">
        {polygonSVG && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Your Land Plot / قطعة أرضك</CardTitle>
            </CardHeader>
            <CardContent>
              <div
                className="w-full bg-white rounded-md border overflow-hidden"
                dangerouslySetInnerHTML={{ __html: polygonSVG }}
              />
              <p className="text-xs text-muted-foreground mt-2">
                Polygon drawn with {vertexCount} vertices
              </p>
            </CardContent>
          </Card>
        )}
        <div className="flex flex-col items-center justify-center py-16 space-y-4">
          <Loader2 className="h-12 w-12 text-primary animate-spin" />
          <div className="space-y-1 text-center">
            <p className="font-semibold">🤖 Generating your floor plan...</p>
            <p className="text-sm text-muted-foreground">Applying cultural rules and spatial logic</p>
            <p className="text-xs text-muted-foreground">This usually takes 20–35 seconds</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 space-y-6">

      {polygonSVG && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Your Land Plot / قطعة أرضك</CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className="w-full bg-white rounded-md border overflow-hidden"
              dangerouslySetInnerHTML={{ __html: polygonSVG }}
            />
            <p className="text-xs text-muted-foreground mt-2">
              Polygon drawn with {vertexCount} vertices
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base sm:text-lg">
            Generated Floor Plan / المخطط المُولَّد
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {generatedImageUrl ? (
            <>
              <div className="flex justify-end mb-1">
                <button
                  onClick={() => setRotateImage(r => !r)}
                  className="text-xs text-muted-foreground border rounded px-2 py-1 hover:bg-accent transition"
                >
                  {rotateImage ? "↩ Reset Rotation" : "↻ Match Polygon Angle"}
                </button>
              </div>
              <div
                className="overflow-hidden rounded-md border flex items-center justify-center bg-white"
                style={{ minHeight: 200 }}
              >
                <img
                  src={generatedImageUrl}
                  alt="AI-generated floor plan"
                  className="cursor-zoom-in transition-transform duration-500"
                  style={{
                    transform: rotateImage ? `rotate(${longestSideAngleDeg.toFixed(1)}deg)` : "none",
                    maxWidth: rotateImage ? "140%" : "100%",
                  }}
                  onClick={() => setLightboxOpen(true)}
                />
              </div>
              <p className="text-xs text-muted-foreground text-center">
                Click image to view full screen
              </p>
            </>
          ) : (
            <div className="w-full aspect-[4/3] rounded-md border bg-muted flex flex-col items-center justify-center gap-3 text-muted-foreground p-4">
              <span className="text-5xl">🏠</span>
              <p className="text-sm text-center">No image returned — try regenerating</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 text-xs sm:text-sm bg-accent/50 rounded-lg p-3">
            <p><span className="font-semibold">Plot Area:</span> {formData.areaM2.toFixed(1)} m²</p>
            <p><span className="font-semibold">Street:</span> {formData.streetSide}</p>
            <p><span className="font-semibold">Bedrooms:</span> {formData.rooms}</p>
            <p><span className="font-semibold">Office:</span> Yes</p>
          </div>

          {error && (
            <div className="rounded-lg border border-destructive bg-destructive/10 p-3 text-sm text-destructive text-center">
              ⚠️ {error}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-col sm:flex-row gap-3">
        <Button size="lg" variant="outline" className="flex-1" onClick={handleRegenerate} disabled={isGenerating}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Regenerate / إعادة التوليد
        </Button>
        <Button size="lg" variant="secondary" className="flex-1" onClick={() => setShowPrompt(!showPrompt)}>
          <FileCode2 className="h-4 w-4 mr-2" />
          {showPrompt ? "Hide Prompt" : "See Prompt / عرض الأمر"}
          {showPrompt ? <ChevronUp className="h-4 w-4 ml-2" /> : <ChevronDown className="h-4 w-4 ml-2" />}
        </Button>
        <Button size="lg" className="flex-1" onClick={handleExportCAD} disabled={!generatedImageUrl}>
          <Download className="h-4 w-4 mr-2" />
          CAD File / ملف CAD
        </Button>
      </div>

      {generatedImageUrl && (
        <Button variant="ghost" size="sm" className="w-full text-muted-foreground" onClick={handleDownloadPNG}>
          <Download className="h-3 w-3 mr-1" /> Download PNG
        </Button>
      )}

      {showPrompt && (
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Prompt Editor / محرر الأمر
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <textarea
              value={editablePrompt}
              onChange={(e) => setEditablePrompt(e.target.value)}
              className="w-full h-64 text-xs font-mono border rounded-md p-3 bg-muted/30 resize-y focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <div className="flex gap-2">
              <Button size="sm" className="flex-1" onClick={handleRegenerateWithEditedPrompt} disabled={isGenerating}>
                <RefreshCw className="h-3 w-3 mr-1" /> Regenerate with Edit
              </Button>
              <Button size="sm" variant="outline" onClick={() => setEditablePrompt(prompt)}>
                Reset to Original
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Button variant="ghost" size="sm" onClick={onReset} className="w-full text-muted-foreground">
        ← Back to Editor / العودة للمحرر
      </Button>

      {lightboxOpen && generatedImageUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setLightboxOpen(false)}
        >
          <img
            src={generatedImageUrl}
            alt="Floor plan fullscreen"
            className="max-w-full max-h-full rounded-lg shadow-2xl"
          />
          <p className="absolute bottom-6 text-white text-sm opacity-70">Click anywhere to close</p>
        </div>
      )}
    </div>
  );
}
