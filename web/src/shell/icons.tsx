/**
 * icons.tsx — single source of SVG icons used across the v2 shell + pages.
 *
 * Stroke-based, 1.6px stroke, currentColor for both stroke and fill so they
 * inherit from the surrounding text colour. Designed to sit comfortably at
 * 18–20px in the sidebar but scale cleanly anywhere.
 */
import type { SVGProps } from "react";

type IconProps = Omit<SVGProps<SVGSVGElement>, "ref"> & { size?: number };

function Svg({ size = 18, children, ...rest }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

export function HomeIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M3 11.5 12 4l9 7.5" />
      <path d="M5.5 10v9.5h4v-6h5v6h4V10" />
    </Svg>
  );
}

export function RoomsIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="3.5" y="4" width="7" height="7" rx="1.2" />
      <rect x="13.5" y="4" width="7" height="7" rx="1.2" />
      <rect x="3.5" y="13" width="7" height="7" rx="1.2" />
      <rect x="13.5" y="13" width="7" height="7" rx="1.2" />
    </Svg>
  );
}

export function ActivityIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M3 12h4l2-7 4 14 2-7h6" />
    </Svg>
  );
}

export function AutomationsIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="2.4" />
      <path d="M12 4v3M12 17v3M20 12h-3M7 12H4M17.7 6.3l-2.1 2.1M8.4 15.6l-2.1 2.1M17.7 17.7l-2.1-2.1M8.4 8.4 6.3 6.3" />
    </Svg>
  );
}

export function DevicesIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="3.5" y="4.5" width="17" height="11" rx="1.5" />
      <path d="M8 19h8M12 15.5v3.5" />
    </Svg>
  );
}

export function SettingsIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="2.6" />
      <path d="M19.4 14.4a7.6 7.6 0 0 0 .1-1.5 7.6 7.6 0 0 0-.1-1.5l2-1.6-2-3.4-2.4.9a7.5 7.5 0 0 0-2.6-1.5l-.4-2.5h-4l-.4 2.5a7.5 7.5 0 0 0-2.6 1.5l-2.4-.9-2 3.4 2 1.6a7.6 7.6 0 0 0 0 3l-2 1.6 2 3.4 2.4-.9a7.5 7.5 0 0 0 2.6 1.5l.4 2.5h4l.4-2.5a7.5 7.5 0 0 0 2.6-1.5l2.4.9 2-3.4-2-1.6Z" />
    </Svg>
  );
}

export function PagesIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="4.5" y="3.5" width="13" height="17" rx="1.5" />
      <path d="M7.5 8h7M7.5 12h7M7.5 16h4" />
    </Svg>
  );
}

export function DisplaysIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="2.5" y="4.5" width="19" height="12" rx="1.5" />
      <path d="M8 20h8M12 16.5v3.5" />
    </Svg>
  );
}

export function PlusIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 5v14M5 12h14" />
    </Svg>
  );
}

export function SearchIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="11" cy="11" r="6" />
      <path d="m20 20-4.3-4.3" />
    </Svg>
  );
}

export function ChevronRightIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="m9 6 6 6-6 6" />
    </Svg>
  );
}

export function CheckIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="m5 12 5 5 9-11" />
    </Svg>
  );
}

export function PowerIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 4v8" />
      <path d="M7 6.5a8 8 0 1 0 10 0" />
    </Svg>
  );
}

export function BulbIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M9 18h6M10 21h4" />
      <path d="M8.5 14a6 6 0 1 1 7 0 4 4 0 0 0-1.5 3v.5h-4v-.5a4 4 0 0 0-1.5-3Z" />
    </Svg>
  );
}

export function ThermometerIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M10 14V5a2 2 0 0 1 4 0v9" />
      <circle cx="12" cy="17" r="3.2" />
    </Svg>
  );
}

export function PluginIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M9 2v4M15 2v4M9 18v4M15 18v4" />
      <rect x="4" y="6" width="16" height="12" rx="2" />
    </Svg>
  );
}

export function SparkleIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 3v3.5M12 17.5V21M3 12h3.5M17.5 12H21M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6" />
    </Svg>
  );
}
