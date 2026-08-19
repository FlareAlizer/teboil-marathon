/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Драйвер Postgres не бандлим — он открывает сокеты на сервере.
  serverExternalPackages: ['pg'],
  eslint: { ignoreDuringBuilds: true },
  // Стенд работает локально, оптимизация картинок не нужна
  images: { unoptimized: true },
};

export default nextConfig;
