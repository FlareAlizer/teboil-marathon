'use client';

/**
 * Ввод целого числа: касания в чеканке, очки в дартсе.
 *
 * Крупное табло и кнопки-прибавки: волонтёр стоит с телефоном в одной руке,
 * рядом очередь, и «34» набирается тремя тапами (+10, +10, +10, +1…) без
 * мелкой цифровой клавиатуры. Поле при этом остаётся обычным вводом — если
 * быстрее напечатать, можно напечатать.
 */
export function CountInput({
  value,
  onChange,
  unit,
  max,
}: {
  value: string;
  onChange: (next: string) => void;
  unit: string;
  max: number;
}) {
  const current = Number(value) || 0;

  function step(delta: number) {
    onChange(String(Math.min(max, Math.max(0, current + delta))));
  }

  return (
    <div>
      <div className="flex items-baseline justify-center gap-3 border-2 border-teboil-blue bg-white px-4 py-3">
        <input
          value={value}
          onChange={(e) => {
            const digits = e.target.value.replace(/\D/g, '').slice(0, String(max).length);
            onChange(digits === '' ? '' : String(Math.min(max, Number(digits))));
          }}
          inputMode="numeric"
          pattern="[0-9]*"
          placeholder="0"
          aria-label={`Результат, ${unit}`}
          className="w-[4.5ch] bg-transparent text-center font-display text-display-md font-black tabular-nums text-teboil-blue placeholder:text-teboil-line focus:outline-none"
        />
        <span className="font-display text-kiosk-base font-bold text-teboil-muted">{unit}</span>
      </div>

      <div className="mt-3 grid grid-cols-5 gap-2">
        <StepButton label="−1" onClick={() => step(-1)} muted />
        <StepButton label="+1" onClick={() => step(1)} />
        <StepButton label="+5" onClick={() => step(5)} />
        <StepButton label="+10" onClick={() => step(10)} />
        <StepButton label="0" onClick={() => onChange('')} muted />
      </div>
    </div>
  );
}

function StepButton({
  label,
  onClick,
  muted = false,
}: {
  label: string;
  onClick: () => void;
  muted?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-tap-lg font-display text-kiosk-lg font-black tabular-nums transition-colors ${
        muted
          ? 'border-2 border-teboil-line bg-white text-teboil-muted active:bg-teboil-surface'
          : 'bg-teboil-blue text-white active:bg-teboil-blue-80'
      }`}
    >
      {label}
    </button>
  );
}
