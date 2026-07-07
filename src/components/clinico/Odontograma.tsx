"use client";

import { cn } from "@/lib/utils";

const ADULT_TEETH = {
  upper: [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28],
  lower: [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38],
};

const CHILD_TEETH = {
  upper: [55, 54, 53, 52, 51, 61, 62, 63, 64, 65],
  lower: [85, 84, 83, 82, 81, 71, 72, 73, 74, 75],
};

export function Odontograma({
  selectedTeeth,
  onChange,
}: {
  selectedTeeth: string[];
  onChange: (teeth: string[]) => void;
}) {
  function toggleTooth(tooth: number) {
    const t = String(tooth);
    if (selectedTeeth.includes(t)) {
      onChange(selectedTeeth.filter((id) => id !== t));
    } else {
      onChange([...selectedTeeth, t]);
    }
  }

  return (
    <div className="flex flex-col gap-6 rounded-xl border border-line bg-surface p-4">
      {/* Permanent Teeth */}
      <div>
        <h4 className="mb-3 text-center text-xs font-semibold uppercase text-muted">Dentes Permanentes</h4>
        <div className="flex flex-col gap-2">
          <div className="flex justify-center gap-1">
            {ADULT_TEETH.upper.map((tooth, idx) => (
              <div key={tooth} className="flex flex-col items-center gap-1">
                <button
                  type="button"
                  onClick={() => toggleTooth(tooth)}
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded border text-xs font-medium transition-colors",
                    selectedTeeth.includes(String(tooth))
                      ? "border-brand-500 bg-brand-500 text-white"
                      : "border-line bg-white text-ink hover:bg-muted-surface"
                  )}
                  style={{ marginRight: idx === 7 ? '12px' : '0' }}
                >
                  {tooth}
                </button>
              </div>
            ))}
          </div>
          <div className="flex justify-center gap-1">
            {ADULT_TEETH.lower.map((tooth, idx) => (
              <div key={tooth} className="flex flex-col items-center gap-1">
                <button
                  type="button"
                  onClick={() => toggleTooth(tooth)}
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded border text-xs font-medium transition-colors",
                    selectedTeeth.includes(String(tooth))
                      ? "border-brand-500 bg-brand-500 text-white"
                      : "border-line bg-white text-ink hover:bg-muted-surface"
                  )}
                  style={{ marginRight: idx === 7 ? '12px' : '0' }}
                >
                  {tooth}
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Deciduous Teeth */}
      <div>
        <h4 className="mb-3 text-center text-xs font-semibold uppercase text-muted">Dentes Decíduos (Leite)</h4>
        <div className="flex flex-col gap-2">
          <div className="flex justify-center gap-1">
            {CHILD_TEETH.upper.map((tooth, idx) => (
              <div key={tooth} className="flex flex-col items-center gap-1">
                <button
                  type="button"
                  onClick={() => toggleTooth(tooth)}
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded border text-xs font-medium transition-colors",
                    selectedTeeth.includes(String(tooth))
                      ? "border-brand-500 bg-brand-500 text-white"
                      : "border-line bg-white text-ink hover:bg-muted-surface"
                  )}
                  style={{ marginRight: idx === 4 ? '12px' : '0' }}
                >
                  {tooth}
                </button>
              </div>
            ))}
          </div>
          <div className="flex justify-center gap-1">
            {CHILD_TEETH.lower.map((tooth, idx) => (
              <div key={tooth} className="flex flex-col items-center gap-1">
                <button
                  type="button"
                  onClick={() => toggleTooth(tooth)}
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded border text-xs font-medium transition-colors",
                    selectedTeeth.includes(String(tooth))
                      ? "border-brand-500 bg-brand-500 text-white"
                      : "border-line bg-white text-ink hover:bg-muted-surface"
                  )}
                  style={{ marginRight: idx === 4 ? '12px' : '0' }}
                >
                  {tooth}
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
