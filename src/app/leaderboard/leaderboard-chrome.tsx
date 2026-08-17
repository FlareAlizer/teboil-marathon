/**
 * Шапка и подвал экрана-телевизора. Только вёрстка, никаких запросов:
 * данные приходят пропсами, чтобы обновление чисел не трогало разметку.
 *
 * Светлая тема дизайн-бука: белый фон, синий текст, красные акценты.
 * Размеры остались в `vh` — экран висит на телевизоре, и вёрстка должна
 * тянуться под любую диагональ.
 */

import { pluralRu } from '@/components/admin/format';
import { SkewedPlate, skewFor } from '@/components/ui';

/**
 * Срез логотипа считается от полной высоты плашки, а не от кегля: текст 6vh
 * плюс `py-[0.7vh]` сверху и снизу дают 7.4vh. Базовые 12px тут не годятся —
 * высота вьюпортная.
 */
const LOGO_SKEW = skewFor(6 + 0.7 * 2, 'vh');

export function LeaderboardHeader() {
  return (
    <header className="flex shrink-0 items-center justify-between gap-[2vw] px-[3vw] py-[2vh]">
      <div className="flex items-center gap-[1.5vw]">
        <SkewedPlate
          as="span"
          tone="red"
          skewX={LOGO_SKEW}
          className="inline-block px-[2.2vw] py-[0.7vh]"
        >
          <span className="font-display text-[6vh] font-black uppercase leading-none text-teboil-white">
            Teboil
          </span>
        </SkewedPlate>

        <span className="font-display text-[4vh] font-black leading-none text-teboil-blue">
          Беговой марафон
        </span>
      </div>

      <span className="font-display text-[4vh] font-black leading-none text-teboil-red">
        Топ дня
      </span>
    </header>
  );
}

export function LeaderboardFooter({
  visitors,
  stale,
}: {
  visitors: number | null;
  stale: boolean;
}) {
  return (
    <footer className="flex shrink-0 items-center justify-between gap-[2vw] px-[3vw] py-[2vh]">
      <div className="flex items-baseline gap-[1.5vw]">
        <span className="font-display text-[9vh] font-black leading-none tabular-nums text-teboil-red">
          {visitors ?? 0}
        </span>
        <span className="font-display text-[3.4vh] font-bold leading-none text-teboil-blue">
          {pluralRu(visitors ?? 0, 'участник', 'участника', 'участников')} сегодня
        </span>
      </div>

      {/* Тихая метка потери связи. Экран без присмотра — гасить его нельзя. */}
      <span
        className={`font-display text-[2.4vh] font-bold text-teboil-muted transition-opacity duration-500 ${
          stale ? 'opacity-100' : 'opacity-0'
        }`}
      >
        Нет связи
      </span>
    </footer>
  );
}
