import { useId } from 'react'

/** 앱 로고: 네이비 그라데이션 위 만년필 펜촉 (public/favicon.svg, build/icon.icns와 같은 디자인) */
export function Logo({ size = 28 }: { size?: number }) {
  const id = useId()
  return (
    <svg className="logo" width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3854DB" />
          <stop offset="1" stopColor="#0F1440" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="14.5" fill={`url(#${id})`} />
      <g fill="#fff" transform="translate(32 32) scale(0.96) translate(-32 -36.25)">
        <path
          fillRule="evenodd"
          d="M32 57C28.5 50 21.5 40 21 32C20.8 27.5 22.6 24.2 25 22.5H39C41.4 24.2 43.2 27.5 43 32C42.5 40 35.5 50 32 57ZM34.6 33A2.6 2.6 0 1 0 29.4 33A2.6 2.6 0 1 0 34.6 33ZM31.25 36.2H32.75V53H31.25Z"
        />
        <rect x="24.5" y="15.5" width="15" height="5" rx="1.4" />
      </g>
    </svg>
  )
}
