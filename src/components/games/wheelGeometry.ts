/**
 * Геометрия рулетки: чистые функции без React и без DOM.
 *
 * Система координат SVG: центр в (0,0), ось Y направлена вниз.
 * Угол отсчитывается от 12 часов по часовой стрелке — так же, как
 * читается положение стрелки-указателя, которая всегда стоит сверху.
 */

export interface Point {
  x: number;
  y: number;
}

/** Остаток от деления, всегда неотрицательный. */
export function mod360(value: number): number {
  return ((value % 360) + 360) % 360;
}

/** Точка на окружности заданного радиуса под углом `angle` (градусы от 12 часов). */
export function polar(angle: number, radius: number): Point {
  const rad = (angle * Math.PI) / 180;
  return {
    x: radius * Math.sin(rad),
    y: -radius * Math.cos(rad),
  };
}

export interface SectorAngles {
  start: number;
  end: number;
  center: number;
}

/** Границы и середина сектора `index` при `count` секторах. */
export function sectorAngles(index: number, count: number): SectorAngles {
  const step = 360 / count;
  const start = index * step;
  return { start, end: start + step, center: start + step / 2 };
}

/** SVG-path клина от центра до радиуса `radius`. */
export function sectorPath(index: number, count: number, radius: number): string {
  const { start, end } = sectorAngles(index, count);

  // Единственный сектор — рисуем полный круг двумя полудугами.
  if (count === 1) {
    return `M 0 ${-radius} A ${radius} ${radius} 0 1 1 0 ${radius} A ${radius} ${radius} 0 1 1 0 ${-radius} Z`;
  }

  const from = polar(start, radius);
  const to = polar(end, radius);
  const largeArc = end - start > 180 ? 1 : 0;

  return [
    'M 0 0',
    `L ${round(from.x)} ${round(from.y)}`,
    `A ${radius} ${radius} 0 ${largeArc} 1 ${round(to.x)} ${round(to.y)}`,
    'Z',
  ].join(' ');
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/**
 * Разбивает подпись сектора на строки по словам.
 * Лишнее не режем молча — последняя строка получает многоточие.
 */
export function wrapLabel(label: string, maxChars: number, maxLines = 2): string[] {
  const words = label.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [''];

  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxChars || !current) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }
  lines.push(current);

  if (lines.length <= maxLines) return lines;

  const kept = lines.slice(0, maxLines - 1);
  const rest = lines.slice(maxLines - 1).join(' ');
  kept.push(rest.length > maxChars ? `${rest.slice(0, Math.max(1, maxChars - 1)).trimEnd()}…` : rest);
  return kept;
}

export interface SpinTargetOptions {
  /** Минимальное число полных оборотов до остановки. */
  minSpins?: number;
  /** Дополнительные случайные обороты сверху (0..extraSpins). */
  extraSpins?: number;
  /**
   * Насколько сильно стрелка может отклониться от середины сектора,
   * в долях половины сектора. 0 — строго в центр, 1 — вплоть до границы.
   */
  jitter?: number;
  /** Источник случайности, [0,1). Вынесен наружу ради детерминированных тестов. */
  random?: () => number;
}

/**
 * Итоговый угол поворота колеса, при котором середина сектора `winnerIndex`
 * окажется под верхней стрелкой. Значение всегда больше текущего — колесо
 * докручивается вперёд и никогда не отматывается назад.
 */
export function spinTarget(
  currentRotation: number,
  winnerIndex: number,
  count: number,
  options: SpinTargetOptions = {},
): number {
  const { minSpins = 5, extraSpins = 2, jitter = 0.62, random = Math.random } = options;

  const step = 360 / count;
  const center = sectorAngles(winnerIndex, count).center;
  const offset = (random() * 2 - 1) * (step / 2) * clamp(jitter, 0, 0.95);

  // Колесо повёрнуто на R, значит сектор виден под углом (center + R).
  // Под стрелкой он окажется, когда (center + R) кратно 360.
  const desired = -center + offset;
  const spins = minSpins + Math.floor(random() * (extraSpins + 1));
  const base = currentRotation + spins * 360;

  return base + mod360(desired - base);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Индекс сектора, стоящего под стрелкой при повороте колеса на `rotation`. */
export function sectorAtPointer(rotation: number, count: number): number {
  const step = 360 / count;
  // Сектор i занимает [i*step, (i+1)*step); под стрелкой — угол (-rotation).
  return Math.floor(mod360(-rotation) / step) % count;
}

/** Случайный индекс из доступных. Возвращает -1, если доступных нет. */
export function pickWinner(availableIndexes: number[], random: () => number = Math.random): number {
  if (availableIndexes.length === 0) return -1;
  return availableIndexes[Math.floor(random() * availableIndexes.length)];
}
