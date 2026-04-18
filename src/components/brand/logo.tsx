export function Logo({ size = 36 }: { size?: number }) {
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg viewBox="0 0 36 36" width={size} height={size}>
        <defs>
          <linearGradient id="aircade-logo-grad" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0" stopColor="#FF9F6B" />
            <stop offset="1" stopColor="#FFB7C5" />
          </linearGradient>
        </defs>
        {/* cabinet body */}
        <rect
          x="8"
          y="11"
          width="20"
          height="20"
          rx="3"
          fill="url(#aircade-logo-grad)"
        />
        {/* screen */}
        <rect
          x="11"
          y="14"
          width="14"
          height="9"
          rx="1.5"
          fill="#FFFBF5"
          stroke="#3D2E1F"
          strokeWidth="0.8"
        />
        {/* coin slot */}
        <rect x="16" y="25" width="4" height="1.2" rx="0.4" fill="#3D2E1F" />
        {/* air swoop */}
        <path
          d="M6 9 Q18 2, 30 9"
          stroke="#3D2E1F"
          strokeWidth="1.6"
          fill="none"
          strokeLinecap="round"
        />
        <circle cx="30" cy="9" r="1.6" fill="#3D2E1F" />
      </svg>
    </div>
  );
}
