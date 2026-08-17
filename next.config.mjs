/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // better-sqlite3 — нативный модуль, его нельзя бандлить
  serverExternalPackages: ['better-sqlite3'],
  eslint: { ignoreDuringBuilds: true },
  // Стенд работает локально, оптимизация картинок не нужна
  images: { unoptimized: true },
};

export default nextConfig;
