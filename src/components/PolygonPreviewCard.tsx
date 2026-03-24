interface PolygonPreviewCardProps {
  svgContent: string;
  vertexCount: number;
}

export default function PolygonPreviewCard({ svgContent, vertexCount }: PolygonPreviewCardProps) {
  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <h3 className="text-base font-semibold">Your Land Plot / قطعة أرضك</h3>
      <div
        className="w-full bg-white rounded-md border overflow-hidden"
        dangerouslySetInnerHTML={{ __html: svgContent }}
      />
      <p className="text-sm text-muted-foreground">
        Polygon drawn with {vertexCount} vertices
      </p>
    </div>
  );
}