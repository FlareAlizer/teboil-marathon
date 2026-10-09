import { cn } from '@/lib/cn';

/**
 * QR-код на сайт для экранов стенда: люди сканируют его с телевизора и
 * попадают сразу на вход в игру.
 *
 * Картинка лежит у нас же (public/img/qr-site-http.svg), а не рисуется скриптом
 * и не берётся с чужого сервиса: телевизору не нужно ничего, кроме нашего
 * сайта, и код не пропадёт ни при плохой связи, ни при сбое скрипта.
 * Ведёт на http://teboil.space/?from=tv — именно http: 9 октября мобильные
 * сети (МТС, МегаФон) обрывали шифрованные соединения с сервером, и по https
 * сайт у людей не открывался. По метке from=tv в журнале видно, сколько
 * людей пришло с экранов.
 */
export function SiteQr({
  className,
  imageClassName,
  textClassName,
}: {
  className?: string;
  imageClassName?: string;
  textClassName?: string;
}) {
  return (
    <div className={cn('flex items-center', className)}>
      {/* eslint-disable-next-line @next/next/no-img-element -- вектор, оптимизировать нечего */}
      <img
        src="/img/qr-site-http.svg"
        alt="QR-код: teboil.space"
        className={cn('aspect-square shrink-0 bg-white [image-rendering:pixelated]', imageClassName)}
      />
      <div className={cn('font-display font-black leading-tight', textClassName)}>
        <p className="text-teboil-red">Играй с телефона</p>
        <p className="text-teboil-blue">Наведи камеру на код</p>
        <p className="text-teboil-muted">teboil.space</p>
      </div>
    </div>
  );
}
