'use client';

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { sectorAngles, sectorPath, pickWinner, spinTarget, wrapLabel } from './wheelGeometry';

/** Сектор колеса. Обычно это тема (рубрика) квиза. */
export interface WheelSector {
  id: string;
  label: string;
  /** Тема исчерпана — сектор гаснет и не может выпасть. */
  disabled?: boolean;
}

export interface SpinWheelProps {
  sectors: WheelSector[];
  /** Вызывается, когда колесо остановилось. */
  onResult: (sector: WheelSector, index: number) => void;
  onSpinStart?: () => void;
  /** Принудительный победитель по id — для отладки и режима оператора. */
  forcedSectorId?: string;
  disabled?: boolean;
  /** Спрятать центральную кнопку и крутить снаружи через ref. */
  hideButton?: boolean;
  buttonLabel?: string;
  durationMs?: number;
  className?: string;
  /**
   * Что писать на секторе. В дизайн-буке на колесе стоят номера, а название
   * темы вынесено под колесо в плашку «Твоя тема» — длинные подписи внутри
   * клина всё равно нечитаемы. Режим 'text' оставлен для отладки.
   */
  labelMode?: 'text' | 'index';
}

export interface SpinWheelHandle {
  spin: () => void;
  isSpinning: () => boolean;
}

const RADIUS = 100;
const RIM_OUTER = 108;
const LABEL_RADIUS = 92;
const LABEL_INNER = 30;
const HUB_RADIUS = 26;
const LAMP_COUNT = 24;

/* Цвета дизайн-бука. Держим их здесь литералами: SVG-заливка не умеет
   tailwind-классы, а фирменные значения продублированы в globals.css. */
const RED = '#EA1B2D';
const BLUE = '#15478E';
const BLUE_80 = '#2D5DBB';
const NAVY = '#0C2E63';

/**
 * Чередование красного и синего, как на колесе в макете. Третий оттенок —
 * чтобы при нечётном числе секторов (во втором квизе тем семь) стык первого
 * и последнего клина не слипся в одно пятно.
 */
function sectorFill(index: number, count: number, disabled?: boolean): string {
  if (disabled) return '#8E9AAE';
  if (count % 2 === 1 && index === count - 1) return BLUE_80;
  return index % 2 === 0 ? RED : BLUE;
}

const SpinWheel = forwardRef<SpinWheelHandle, SpinWheelProps>(function SpinWheel(
  {
    sectors,
    onResult,
    onSpinStart,
    forcedSectorId,
    disabled = false,
    hideButton = false,
    buttonLabel = 'Крутить',
    durationMs = 5200,
    className,
    labelMode = 'index',
  },
  ref,
) {
  const [rotation, setRotation] = useState(0);
  const [isSpinning, setIsSpinning] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [announced, setAnnounced] = useState<string | null>(null);

  const winnerRef = useRef<number>(-1);
  const settledRef = useRef(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const count = sectors.length;
  const availableCount = useMemo(() => sectors.filter((s) => !s.disabled).length, [sectors]);
  const canSpin = !disabled && !isSpinning && availableCount > 0;

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReducedMotion(query.matches);
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const spinDuration = reducedMotion ? 600 : durationMs;

  const settle = useCallback(() => {
    if (settledRef.current) return;
    settledRef.current = true;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setIsSpinning(false);

    const index = winnerRef.current;
    const sector = sectors[index];
    if (sector) {
      setAnnounced(sector.label);
      onResult(sector, index);
    }
  }, [onResult, sectors]);

  const spin = useCallback(() => {
    if (!canSpin) return;

    const available = sectors.map((_, index) => index).filter((index) => !sectors[index].disabled);
    const forcedIndex = forcedSectorId ? sectors.findIndex((s) => s.id === forcedSectorId) : -1;
    const winner =
      forcedIndex >= 0 && available.includes(forcedIndex) ? forcedIndex : pickWinner(available);
    if (winner < 0) return;

    winnerRef.current = winner;
    settledRef.current = false;
    setAnnounced(null);
    setIsSpinning(true);
    onSpinStart?.();
    setRotation((current) => spinTarget(current, winner, count, { minSpins: reducedMotion ? 1 : 5 }));

    // Страховка: если transitionend не долетит, результат всё равно покажем.
    timerRef.current = setTimeout(settle, spinDuration + 400);
  }, [canSpin, count, forcedSectorId, onSpinStart, reducedMotion, sectors, settle, spinDuration]);

  useImperativeHandle(ref, () => ({ spin, isSpinning: () => isSpinning }), [spin, isSpinning]);

  if (count === 0) return null;

  return (
    <div className={`relative mx-auto aspect-square w-full max-w-[min(88vw,560px)] ${className ?? ''}`}>
      <div
        className="h-full w-full will-change-transform"
        style={{
          transform: `rotate(${rotation}deg)`,
          transition: isSpinning
            ? `transform ${spinDuration}ms cubic-bezier(0.08, 0.72, 0.12, 1)`
            : undefined,
        }}
        onTransitionEnd={(event) => {
          if (event.propertyName === 'transform') settle();
        }}
      >
        <WheelFace sectors={sectors} spinning={isSpinning} labelMode={labelMode} />
      </div>

      <Pointer />

      {!hideButton && (
        <button
          type="button"
          onClick={spin}
          disabled={!canSpin}
          aria-label={isSpinning ? 'Колесо крутится' : buttonLabel}
          className="absolute left-1/2 top-1/2 flex h-[23%] w-[23%] min-h-[104px] min-w-[104px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-4 border-white bg-teboil-blue-dark text-center font-display text-[clamp(0.9rem,2.6vw,1.25rem)] font-black leading-none text-white transition active:scale-95 disabled:opacity-70 disabled:active:scale-100"
        >
          {isSpinning ? '...' : buttonLabel}
        </button>
      )}

      <p className="sr-only" aria-live="polite">
        {announced ? `Выпала тема: ${announced}` : ''}
      </p>
    </div>
  );
});

export default SpinWheel;

/**
 * Неподвижная стрелка-указатель сверху: белый треугольник остриём вниз,
 * как в дизайн-буке. Лежит поверх обода и заходит на первый ряд секторов.
 */
function Pointer() {
  return (
    <div className="pointer-events-none absolute left-1/2 top-0 z-10 -translate-x-1/2 translate-y-[6%]">
      <svg width="34" height="30" viewBox="0 0 34 30" aria-hidden="true">
        <path d="M0 0 H34 L17 30 Z" fill="#FFFFFF" />
      </svg>
    </div>
  );
}

function WheelFace({
  sectors,
  spinning,
  labelMode,
}: {
  sectors: WheelSector[];
  spinning: boolean;
  labelMode: 'text' | 'index';
}) {
  const count = sectors.length;
  const band = LABEL_RADIUS - LABEL_INNER;
  const baseFont = count <= 6 ? 10 : count <= 8 ? 9 : count <= 10 ? 8 : 7;
  const maxChars = Math.max(6, Math.floor(band / (baseFont * 0.6)));

  return (
    <svg viewBox="-114 -114 228 228" className="h-full w-full" role="img" aria-label="Колесо тем">
      <circle r={RIM_OUTER} fill={NAVY} />

      {sectors.map((sector, index) => (
        <path
          key={`sector-${sector.id}`}
          d={sectorPath(index, count, RADIUS)}
          fill={sectorFill(index, count, sector.disabled)}
          stroke={NAVY}
          strokeWidth="1.5"
        />
      ))}

      {labelMode === 'index'
        ? sectors.map((sector, index) => (
            <IndexLabel key={`label-${sector.id}`} index={index} count={count} />
          ))
        : sectors.map((sector, index) => (
            <SectorLabel
              key={`label-${sector.id}`}
              sector={sector}
              index={index}
              count={count}
              baseFont={baseFont}
              maxChars={maxChars}
              band={band}
            />
          ))}

      {Array.from({ length: LAMP_COUNT }, (_, index) => {
        const angle = (360 / LAMP_COUNT) * index;
        const rad = (angle * Math.PI) / 180;
        return (
          <circle
            key={`lamp-${index}`}
            cx={104 * Math.sin(rad)}
            cy={-104 * Math.cos(rad)}
            r={2.5}
            fill="#FFFFFF"
            opacity={spinning ? 0.9 : 0.45}
          />
        );
      })}

      {/* Ступица с логотипом. Когда включена центральная кнопка, она эту
          ступицу закрывает — надпись видна только в режиме внешней кнопки. */}
      <circle r={HUB_RADIUS + 6} fill={NAVY} stroke="#FFFFFF" strokeWidth="2" />
      <text
        y={4}
        textAnchor="middle"
        fontSize={13}
        fill="#FFFFFF"
        style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontStyle: 'italic' }}
      >
        TEBOIL
      </text>
    </svg>
  );
}

/** Номер сектора — подпись колеса в дизайн-буке. */
function IndexLabel({ index, count }: { index: number; count: number }) {
  const { center } = sectorAngles(index, count);
  const radius = (LABEL_RADIUS + LABEL_INNER + HUB_RADIUS) / 2.4;
  const rad = (center * Math.PI) / 180;

  return (
    <text
      x={radius * Math.sin(rad)}
      y={-radius * Math.cos(rad) + 6}
      textAnchor="middle"
      fontSize={17}
      fill="#FFFFFF"
      style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}
    >
      {index + 1}
    </text>
  );
}

function SectorLabel({
  sector,
  index,
  count,
  baseFont,
  maxChars,
  band,
}: {
  sector: WheelSector;
  index: number;
  count: number;
  baseFont: number;
  maxChars: number;
  band: number;
}) {
  const { center } = sectorAngles(index, count);
  const lines = wrapLabel(sector.label.toUpperCase(), maxChars, 2);
  const longest = Math.max(...lines.map((line) => line.length), 1);
  const fontSize = Math.max(5, Math.min(baseFont, band / (longest * 0.6)));

  // Правая половина читается снаружи внутрь, левая — изнутри наружу,
  // чтобы подписи нигде не оказались вверх ногами.
  const rightHalf = center <= 180;

  return (
    <g transform={`rotate(${center})`}>
      <text
        transform={`translate(0, ${-LABEL_RADIUS}) rotate(${rightHalf ? -90 : 90})`}
        textAnchor={rightHalf ? 'end' : 'start'}
        fontSize={fontSize}
        fill={sector.disabled ? '#9A9AA8' : '#FFFFFF'}
        style={{ fontFamily: 'var(--font-display)', fontWeight: 900, letterSpacing: '-0.01em' }}
      >
        {lines.map((line, lineIndex) => (
          <tspan
            key={lineIndex}
            x={0}
            dy={lineIndex === 0 ? `${-(lines.length - 1) * 0.55 + 0.34}em` : '1.1em'}
          >
            {line}
          </tspan>
        ))}
      </text>
    </g>
  );
}
