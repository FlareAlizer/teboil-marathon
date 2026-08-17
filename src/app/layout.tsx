import type { Metadata, Viewport } from 'next';
import { Montserrat } from 'next/font/google';
import './globals.css';

/**
 * Единственная гарнитура дизайн-бука. Medium 500 / Bold 700 / Black 900.
 * next/font скачивает файлы на этапе сборки и раздаёт их локально, поэтому
 * на стенде интернет не нужен — он нужен только при `next build`.
 */
const montserrat = Montserrat({
  subsets: ['latin', 'cyrillic'],
  weight: ['500', '700', '900'],
  variable: '--font-montserrat',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Teboil — Беговой марафон',
  description: 'Игровая зона стенда Teboil на беговом марафоне',
  // Иконка указана явно: без неё браузер сам просит /favicon.ico и получает
  // 404 — единственная ошибка в консоли киоска, и пустой значок у вкладки.
  // Лежит в /img, а не в корне: путь /icon Next резервирует под собственную
  // конвенцию метаданных и перекрывает одноимённый файл из public.
  icons: { icon: '/img/favicon.svg' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#FFFFFF',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className={montserrat.variable}>
      <body className="min-h-dvh bg-teboil-white font-sans text-teboil-black antialiased no-select">
        {children}
      </body>
    </html>
  );
}
