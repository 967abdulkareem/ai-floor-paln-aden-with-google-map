interface CalculationsPanelProps {
  areaM2: number;
  buildableRect: {
    rectWidthM: number;
    rectDepthM: number;
    rectAreaM2: number;
    adjustedForCoverage: boolean;
  };
  buildingHeightM: number;
  streetSide: string;
}

const rows = (props: CalculationsPanelProps) => [
  { icon: "📐", en: "Land Area", ar: "مساحة الأرض", value: `${props.areaM2.toFixed(1)} m²` },
  { icon: "🏗️", en: "Max Buildable (70%)", ar: "أقصى بناء", value: `${(props.areaM2 * 0.7).toFixed(1)} m²` },
  { icon: "📏", en: "Buildable Rectangle", ar: "مستطيل البناء", value: `${props.buildableRect.rectWidthM}m × ${props.buildableRect.rectDepthM}m` },
  { icon: "📐", en: "Rectangle Area", ar: "مساحة المستطيل", value: `${props.buildableRect.rectAreaM2} m²` },
  { icon: "🏢", en: "Max Building Height", ar: "أقصى ارتفاع", value: `${props.buildingHeightM} m` },
  { icon: "🛣️", en: "Street Side", ar: "جهة الشارع", value: props.streetSide },
];

export default function CalculationsPanel(props: CalculationsPanelProps) {
  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <h3 className="text-base font-semibold">Plot Calculations / حسابات القطعة</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {rows(props).map((r) => (
          <div key={r.en} className="flex items-start gap-2 text-sm">
            <span>{r.icon}</span>
            <div>
              <span className="font-medium">{r.en}</span>
              <span className="text-muted-foreground"> / {r.ar}</span>
              <p className="font-semibold">{r.value}</p>
            </div>
          </div>
        ))}
      </div>
      {props.buildableRect.adjustedForCoverage && (
        <p className="text-sm text-orange-600 font-medium">
          ⚠️ Coverage adjusted to 70% / تم تعديل التغطية إلى 70%
        </p>
      )}
    </div>
  );
}