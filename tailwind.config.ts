import type { Config } from 'tailwindcss';

/**
 * Дизайн-система Teboil — фирменный дизайн-бук (Figma h8djIhDnfkgyOw7Pl3O8Ew).
 *
 * Светлая тема: белый фон, чёрный текст, красный и синий — акценты.
 * Скошенные плашки-параллелограммы срезаны под 12° (см. .skewed в globals.css).
 * Углы прямые: rounded-card / rounded-btn намеренно равны 0.
 */
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        teboil: {
          // --- Фирменная палитра из дизайн-бука ---
          red: '#EA1B2D',
          'red-80': '#FF3652',
          'red-60': '#FF727F',
          blue: '#15478E',
          'blue-80': '#2D5DBB',
          'blue-60': '#6586CD',
          black: '#000000',
          white: '#FFFFFF',

          // Нейтрали, снятые пипеткой с макета
          gray: '#D1D3D4', // серые плашки-карточки
          'blue-pale': '#CBD6EF', // карточки на синей подложке

          // Производные оттенки: в дизайн-буке их нет, они понадобились по ходу
          // вёрстки. Держим здесь, чтобы не расползались хардкодом по экранам.
          'blue-dark': '#0C2E63', // центр колеса, тёмный акцент на синем
          'blue-40': '#99AFDF', // светлая подпись на синей подложке
          'red-40': '#FFD1D4', // светлая подпись на красной подложке

          // --- Совместимость: имена из тёмной темы, перенесённые в светлую.
          // Не удалены, потому что используются в экранах других агентов. ---
          'red-light': '#FF3652', // = red-80
          'red-dark': '#C4121F', // нажатое состояние
          ink: '#FFFFFF', // только как фон → белый
          surface: '#F2F3F4', // только как фон → светлая подложка
          elevated: '#FFFFFF', // только как фон → белый + тень
          line: '#D1D3D4', // только как border
          muted: '#5F6569', // только как текст, контраст AA на белом
          gold: '#F5C542',
          // Состояния ответа в квизах
          green: '#30A915',
          'green-60': '#7BE86A', // светлый — для текста на синей/тёмной подложке
          correct: '#30A915',
          'correct-60': '#7BE86A',
          wrong: '#EA1B2D',
        },
      },
      fontFamily: {
        display: ['var(--font-display)'],
        sans: ['var(--font-body)'],
      },
      fontSize: {
        // Киоск: всё крупнее обычного веба. letterSpacing 0 — как в дизайн-буке.
        'kiosk-sm': ['1.125rem', { lineHeight: '1.4', letterSpacing: '0' }],
        'kiosk-base': ['1.375rem', { lineHeight: '1.35', letterSpacing: '0' }],
        'kiosk-lg': ['1.75rem', { lineHeight: '1.25', letterSpacing: '0' }],
        'kiosk-xl': ['2.25rem', { lineHeight: '1.15', letterSpacing: '0' }],
        'display-sm': ['2.75rem', { lineHeight: '1.1', letterSpacing: '0' }],
        'display-md': ['4rem', { lineHeight: '1.05', letterSpacing: '0' }],
        'display-lg': ['5.5rem', { lineHeight: '1', letterSpacing: '0' }],
        'display-xl': ['8rem', { lineHeight: '1', letterSpacing: '0' }],
      },
      minHeight: {
        tap: '56px',
        'tap-lg': '72px',
        'tap-xl': '88px',
      },
      borderRadius: {
        // Макет строго прямоугольный — имена сохранены, значения обнулены.
        card: '0px',
        btn: '0px',
      },
      skew: {
        // Фирменный срез: 9.466px по горизонтали на 44.5px высоты → 12°.
        brand: '-12deg',
        'brand-inv': '12deg',
      },
      boxShadow: {
        card: '0 4px 20px rgba(0,0,0,.10)',
        glow: '0 0 0 4px rgba(234,27,45,.25)',
        'glow-lg': '0 8px 28px rgba(234,27,45,.30)',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'pop-in': {
          '0%': { opacity: '0', transform: 'scale(.9)' },
          '70%': { transform: 'scale(1.03)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        'pulse-red': {
          '0%,100%': { boxShadow: '0 0 0 0 rgba(234,27,45,.55)' },
          '50%': { boxShadow: '0 0 0 18px rgba(234,27,45,0)' },
        },
        marquee: {
          from: { transform: 'translateX(0)' },
          to: { transform: 'translateX(-50%)' },
        },
      },
      animation: {
        'fade-in': 'fade-in .35s ease-out both',
        'pop-in': 'pop-in .4s cubic-bezier(.2,.9,.3,1.2) both',
        'pulse-red': 'pulse-red 2s ease-out infinite',
        marquee: 'marquee 24s linear infinite',
      },
    },
  },
  plugins: [],
};

export default config;
