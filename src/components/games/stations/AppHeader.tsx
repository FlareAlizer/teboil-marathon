import { SkewedPlate, skewFor } from '@/components/ui';
import { cn } from '@/lib/cn';

/**
 * Срез логотипа считается от полной высоты плашки, а не от кегля: текст 17px
 * плюс `py-1` сверху и снизу дают 25px. Забыть про паддинги здесь легко,
 * а угол от этого молча уезжает с фирменных 12°.
 */
const LOGO_SKEW = skewFor(17 + 4 * 2);

/**
 * Шапка светлых экранов: логотип TEBOIL, «Беговой марафон» и счёт справа.
 *
 * Одна и та же на главном экране, на станциях и на всех экранах квиза, поэтому
 * пропс ровно один — текущие очки. Ни кнопки «назад», ни никнейма в макете
 * здесь нет, и добавлять их сюда не нужно: на экранах, где возврат требуется,
 * кнопка стоит отдельно, ниже шапки.
 */
export function AppHeader({
  points,
  className,
}: {
  points: number;
  className?: string;
}) {
  return (
    <header className={cn('bg-teboil-white', className)}>
      <div className="flex items-center justify-between gap-3 px-4 pb-2 pt-3">
        <div className="flex items-center gap-2">
          <SkewedPlate
            as="span"
            tone="red"
            skewX={LOGO_SKEW}
            className="inline-block px-4 py-1"
          >
            <span className="font-display text-[17px] font-black uppercase leading-none text-teboil-white">
              Teboil
            </span>
          </SkewedPlate>

          {/* Две строки вместо одной: в макете подпись прижата к логотипу
              и по высоте совпадает с ним. */}
          <span className="font-display text-[11px] font-bold leading-[1.05] text-teboil-blue">
            Беговой
            <br />
            марафон
          </span>
        </div>

        <div className="flex items-baseline gap-2">
          <span className="font-display text-[15px] font-bold text-teboil-blue">
            Очки
          </span>
          <span className="font-display text-[19px] font-black leading-none tabular-nums text-teboil-red">
            {points}
          </span>
        </div>
      </div>

      {/* Двухцветная скошенная полоса под шапкой — готовый класс дизайн-системы.
          Чистое оформление, поэтому скрыта от скринридеров. */}
      <div aria-hidden className="brand-bar" />
    </header>
  );
}
