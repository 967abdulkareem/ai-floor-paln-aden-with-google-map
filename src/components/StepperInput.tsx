import { Button } from "@/components/ui/button";
import { Minus, Plus } from "lucide-react";

interface StepperInputProps {
  value: number;
  onChange: (val: number) => void;
  min: number;
  max: number;
  label: string;
  labelAr: string;
}

export default function StepperInput({ value, onChange, min, max, label, labelAr }: StepperInputProps) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium">
        {label} / {labelAr}
      </label>
      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-9 w-9"
          onClick={() => onChange(Math.max(min, value - 1))}
          disabled={value <= min}
        >
          <Minus className="h-4 w-4" />
        </Button>
        <span className="w-8 text-center font-semibold text-lg">{value}</span>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-9 w-9"
          onClick={() => onChange(Math.min(max, value + 1))}
          disabled={value >= max}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
