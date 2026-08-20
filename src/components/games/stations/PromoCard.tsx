import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * Адреса от заказчика. Держим здесь, а не в вызывающих экранах: карточки
 * стоят в двух местах, и разъехавшиеся ссылки заметили бы не сразу.
 */
export const SHOP_URL = 'https://shop.teboil.ru';
export const LOYALTY_URL = 'https://lk.teboil.ru/applink/azs/quwnBtYP';

export type PromoTone = 'red' | 'blue';

/**
 * Белая промо-карточка с цветной рамкой: «Онлайн магазин» (красная рамка) и
 * «Программа лояльности» (синяя). Заголовок всегда синий, а подпись —
 * в цвет рамки, как в макете.
 *
 * Адрес передаётся пропсом `href` и по умолчанию берётся из констант выше.
 * Он необязателен: без него карточка остаётся обычным блоком, а не ссылкой,
 * которая никуда не ведёт.
 *
 * Картинка передаётся пропсом `illustration`, а не зашита внутрь: у карточки
 * магазина в макете справа стоит тележка, у карточки лояльности картинки нет.
 * Без пропса карточка верстается без иллюстрации и ничего не ломает.
 */
export function PromoCard({
  title,
  note,
  tone,
  illustration,
  href,
  className,
}: {
  title: ReactNode;
  note: string;
  tone: PromoTone;
  illustration?: ReactNode;
  href?: string;
  className?: string;
}) {
  const border = tone === 'red' ? 'border-teboil-red' : 'border-teboil-blue';
  const noteColor = tone === 'red' ? 'text-teboil-red' : 'text-teboil-blue';

  const content = (
    <>
      <span className="min-w-0 flex-1">
        <span className="block font-display text-[21px] font-bold leading-[1.1] text-teboil-blue">
          {title}
        </span>
        <span className={cn('mt-2 block text-[13px] font-medium leading-snug', noteColor)}>
          {note}
        </span>
      </span>

      {illustration && (
        <span
          aria-hidden
          className="ml-3 flex w-[72px] shrink-0 items-center justify-end sm:w-[120px]"
        >
          {illustration}
        </span>
      )}
    </>
  );

  const shell = cn(
    'flex w-full items-center border-2 bg-teboil-white p-4 text-left',
    border,
    className,
  );

  // Без адреса — просто блок с текстом. Делать из него кнопку, которая
  // никуда не ведёт, значит обманывать участника.
  if (!href) {
    return <div className={shell}>{content}</div>;
  }

  return (
    <a href={href} className={cn(shell, 'active:opacity-90')}>
      {content}
    </a>
  );
}

/**
 * Тележка из макета (узел 51:68), выгруженная в `public/img/`.
 *
 * Обычный `<img>`, а не `next/image`: картинка статичная, лежит рядом, и
 * оптимизатор Next на стенде без интернета только добавил бы риска.
 */
function CartImage() {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/img/promo-cart.png"
      alt=""
      className="h-auto w-full max-w-[72px] sm:max-w-[120px]"
    />
  );
}

/**
 * QR-код Teboil справа от промо-плашек.
 *
 * Рамка синяя, как у карточки лояльности, и сам код прижат по центру своей
 * колонки — так пара плашек и квадрат читаются одним блоком, а не двумя
 * случайно поставленными рядом элементами.
 *
 * Ширина задана в тех же единицах, что у плашек, поэтому на узком экране
 * телефона колонка сжимается вместе с ними, а не выдавливает текст.
 */
function QrPanel() {
  return (
    <div className="flex w-[104px] shrink-0 flex-col sm:w-[132px] items-center justify-center gap-2 border-2 border-teboil-blue bg-teboil-white p-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/img/qr-teboil.jpg"
        alt="QR-код Teboil"
        className="h-auto w-full"
      />
      {/* Без подписи участник не понимает, что это за квадрат и зачем он.
          Заодно она заполняет колонку, которая иначе выглядит полупустой
          рядом с двумя плашками. */}
      <span className="text-center text-[11px] font-medium leading-tight text-teboil-blue">
        Наведи камеру телефона
      </span>
    </div>
  );
}

/**
 * Пара промо-карточек в том виде, в каком они стоят и на главном экране,
 * и на экране станций. Вынесены вместе, чтобы тексты не разъехались между
 * двумя экранами при правках.
 *
 * Тележка подставляется сама: она есть в макете на обоих экранах, и требовать
 * её от каждого вызывающего значило бы ждать, что о ней кто-то не забудет.
 * Проп `illustration` остаётся, если понадобится заменить или убрать её.
 */
export function PromoCards({
  illustration = <CartImage />,
  shopHref = SHOP_URL,
  loyaltyHref = LOYALTY_URL,
  className,
}: {
  illustration?: ReactNode;
  shopHref?: string;
  loyaltyHref?: string;
  className?: string;
}) {
  return (
    <div className={cn('flex items-stretch gap-3', className)}>
      {/* Плашки занимают всю оставшуюся ширину, QR стоит справа от обеих
          и растягивается на их общую высоту. */}
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <PromoCard
          tone="red"
          title={
            <>
              Онлайн
              <br />
              магазин
            </>
          }
          note="Масла и автохимия с доставкой"
          illustration={illustration}
          href={shopHref}
          className="flex-1"
        />
        <PromoCard
          tone="blue"
          title={
            <>
              Программа
              <br />
              лояльности
            </>
          }
          note="Баллы за каждый литр"
          href={loyaltyHref}
          className="flex-1"
        />
      </div>

      <QrPanel />
    </div>
  );
}
