import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type PromoTone = 'red' | 'blue';

/**
 * Белая промо-карточка с цветной рамкой: «Онлайн магазин» (красная рамка) и
 * «Программа лояльности» (синяя). Заголовок всегда синий, а подпись —
 * в цвет рамки, как в макете.
 *
 * Ссылок пока нет: заказчик подтвердил, что блоки верстаются как в макете,
 * но никуда не ведут, а выдумывать адреса Teboil нельзя. Поэтому есть
 * необязательный проп `href` — когда адрес появится, карточка становится
 * ссылкой одной строкой, без правки вёрстки.
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
          className="ml-3 flex w-[120px] shrink-0 items-center justify-end"
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

  // Пока адреса нет — это просто блок с текстом. Делать из него кнопку,
  // которая никуда не ведёт, значит обманывать пользователя.
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
      className="h-auto w-full max-w-[120px]"
    />
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
  shopHref,
  loyaltyHref,
  className,
}: {
  illustration?: ReactNode;
  shopHref?: string;
  loyaltyHref?: string;
  className?: string;
}) {
  return (
    <div className={cn('space-y-3', className)}>
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
      />
    </div>
  );
}
