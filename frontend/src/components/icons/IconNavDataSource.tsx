/**
 * Data Source icon — outline-style database cylinder.
 *
 * Two layers:
 *   - Union  (14×18, inset 3px/5px): muted background pill
 *   - Vector (16×20, inset 2px/4px): outline cylinder (currentColor)
 *
 * state="connected"  → plain cylinder (default)
 * state="fail"       → red ✕ badge bottom-right
 * state="degraded"   → orange ⌄⌄ badge bottom-right
 */

interface IconNavDataSourceProps {
  size?: number;
  className?: string;
  state?: "connected" | "fail" | "degraded";
}

export function IconNavDataSource({
  size = 20,
  className,
  state = "connected",
}: IconNavDataSourceProps) {
  const badgeSize = Math.round(size * 0.42);

  return (
    <span
      className={`relative inline-flex shrink-0${className ? ` ${className}` : ""}`}
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* ── Union: background pill 14×18, inset 3px top/bottom, 5px left/right ── */}
        <rect x="5" y="3" width="14" height="18" rx="7" fill="var(--muted)" />

        {/* ── Vector: outline cylinder 16×20, inset 2px top/bottom, 4px left/right ── */}
        {/* Top ellipse */}
        <ellipse
          cx="12"
          cy="6"
          rx="7"
          ry="3"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Cylinder sides + bottom curve */}
        <path
          d="M5 6V18C5 19.657 8.134 21 12 21C15.866 21 19 19.657 19 18V6"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Separator 1 */}
        <path
          d="M5 11C5 12.657 8.134 14 12 14C15.866 14 19 12.657 19 11"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Separator 2 */}
        <path
          d="M5 15C5 16.657 8.134 18 12 18C15.866 18 19 16.657 19 15"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>

      {/* ── Fail badge: red circle with × ── */}
      {state === "fail" && (
        <svg
          width={badgeSize}
          height={badgeSize}
          viewBox="0 0 11 11"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          style={{ position: "absolute", bottom: 0, right: 0 }}
        >
          <circle cx="5.5" cy="5.5" r="5.5" fill="var(--destructive)" />
          <path
            d="M3.5 3.5L7.5 7.5M7.5 3.5L3.5 7.5"
            stroke="white"
            strokeWidth="1.3"
            strokeLinecap="round"
          />
        </svg>
      )}

      {/* ── Degraded badge: orange circle with ⌄⌄ chevrons ── */}
      {state === "degraded" && (
        <svg
          width={badgeSize}
          height={badgeSize}
          viewBox="0 0 11 11"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          style={{ position: "absolute", bottom: 0, right: 0 }}
        >
          <circle cx="5.5" cy="5.5" r="5.5" fill="#FFA940" />
          <path
            d="M3.5 3.5L5.5 5.5L7.5 3.5M3.5 5.5L5.5 7.5L7.5 5.5"
            stroke="white"
            strokeWidth="1.3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </span>
  );
}
