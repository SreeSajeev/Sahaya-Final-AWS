import { useRef, KeyboardEvent, ClipboardEvent, ChangeEvent } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type OtpInputProps = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  length?: number;
};

export function OtpInput({ value, onChange, disabled, length = 6 }: OtpInputProps) {
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);
  const digits = value.padEnd(length, " ").slice(0, length).split("");

  const updateAt = (index: number, char: string) => {
    const arr = value.padEnd(length, " ").slice(0, length).split("");
    arr[index] = char;
    const next = arr.join("").replace(/\s/g, "").slice(0, length);
    onChange(next);
  };

  const handleChange = (index: number, e: ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value.replace(/\D/g, "");
    if (!v) {
      updateAt(index, "");
      return;
    }
    if (v.length === 1) {
      updateAt(index, v);
      if (index < length - 1) inputsRef.current[index + 1]?.focus();
      return;
    }
    const pasted = v.slice(0, length);
    onChange(pasted);
    const focusIdx = Math.min(pasted.length, length - 1);
    inputsRef.current[focusIdx]?.focus();
  };

  const handleKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !digits[index]?.trim() && index > 0) {
      inputsRef.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, length);
    if (text) onChange(text);
  };

  return (
    <div className="flex justify-center gap-2">
      {Array.from({ length }).map((_, i) => (
        <Input
          key={i}
          ref={(el) => {
            inputsRef.current[i] = el;
          }}
          type="text"
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          maxLength={6}
          disabled={disabled}
          className={cn(
            "h-12 w-10 text-center text-lg font-semibold sm:h-14 sm:w-12",
            "px-0"
          )}
          value={digits[i]?.trim() ? digits[i] : ""}
          onChange={(e) => handleChange(i, e)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={handlePaste}
          aria-label={`Digit ${i + 1} of ${length}`}
        />
      ))}
    </div>
  );
}
