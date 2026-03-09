import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

const features = [
  { icon: "🗺️", title: "Draw your land", titleAr: "ارسم أرضك" },
  { icon: "🏠", title: "Get a floor plan", titleAr: "احصل على مخطط" },
  { icon: "📐", title: "Download CAD file", titleAr: "حمّل ملف CAD" },
];

const authors = ["Abdulkareem Dughaish", "Aymen Al-Eryani", "Kareem Anam"];

export default function Index() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4 py-12">
      <div className="max-w-2xl w-full text-center space-y-8">
        <div className="space-y-4">
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight">
            Munasib <span className="text-primary/70">/ مناسب</span>
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground leading-relaxed max-w-xl mx-auto">
            AI-Assisted Residential Floor Plan Generation with Cultural, Environmental, and Regulatory Constraints: A Case Study for Sana'a, Yemen
          </p>
          <p className="text-sm text-muted-foreground" dir="rtl">
            توليد مخططات سكنية بمساعدة الذكاء الاصطناعي مع مراعاة القيود الثقافية والبيئية والتنظيمية: دراسة حالة لصنعاء، اليمن
          </p>
        </div>

        <Button
          size="lg"
          className="text-lg px-10 py-6 h-auto"
          onClick={() => navigate("/generator")}
        >
          Start Planning / ابدأ التخطيط
        </Button>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-6">
          {features.map((f) => (
            <div key={f.title} className="flex flex-col items-center gap-2 p-4 rounded-lg bg-accent/40">
              <span className="text-4xl">{f.icon}</span>
              <p className="font-medium text-sm">{f.title}</p>
              <p className="text-xs text-muted-foreground" dir="rtl">{f.titleAr}</p>
            </div>
          ))}
        </div>

        {/* Authors */}
        <div className="pt-4 space-y-2">
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Done by</p>
          <div className="flex flex-wrap justify-center gap-x-4 gap-y-1">
            {authors.map((name) => (
              <p key={name} className="text-sm font-medium">{name}</p>
            ))}
          </div>
        </div>
      </div>

      <footer className="mt-12 text-center text-xs text-muted-foreground max-w-lg px-4">
        Developed as part of academic research on AI-assisted architectural design for developing countries | Sana'a, Yemen
      </footer>
    </div>
  );
}
