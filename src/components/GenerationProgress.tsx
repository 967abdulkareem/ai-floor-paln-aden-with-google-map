import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

const STEPS = [
  { icon: "🗺️", text: "Analyzing your land...", textAr: "تحليل أرضك..." },
  { icon: "🤖", text: "Generating floor plan with AI...", textAr: "توليد المخطط بالذكاء الاصطناعي..." },
  { icon: "📐", text: "Building your CAD file...", textAr: "بناء ملف CAD..." },
];

export default function GenerationProgress() {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const t1 = setTimeout(() => setStep(1), 1000);
    const t2 = setTimeout(() => setStep(2), 3000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  return (
    <div className="flex flex-col items-center justify-center py-16 space-y-6">
      <Loader2 className="h-12 w-12 text-primary animate-spin" />
      <div className="space-y-3 text-center">
        {STEPS.map((s, i) => (
          <p
            key={i}
            className={`text-sm transition-opacity duration-500 ${
              i <= step ? "opacity-100" : "opacity-0"
            } ${i === step ? "font-semibold" : "text-muted-foreground"}`}
          >
            {s.icon} {s.text}
          </p>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">This usually takes 15–30 seconds</p>
    </div>
  );
}
