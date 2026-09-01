// @ts-nocheck
import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function svgProps(p: IconProps) {
  const { size, ...rest } = p;
  return {
    width: size ?? 20,
    height: size ?? 20,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    ...rest,
  };
}

export const IconBike = (p: IconProps) => (
  <svg {...svgProps(p)}>
    <circle cx="5.5" cy="17.5" r="3.5" />
    <circle cx="18.5" cy="17.5" r="3.5" />
    <circle cx="15" cy="5" r="1" />
    <path d="M12 17.5V14l-3-3 4-3 2 3h2" />
  </svg>
);

export const IconDash = (p: IconProps) => (
  <svg {...svgProps(p)}>
    <rect x="3" y="3" width="8" height="10" rx="1.5" />
    <rect x="13" y="3" width="8" height="6" rx="1.5" />
    <rect x="13" y="11" width="8" height="10" rx="1.5" />
    <rect x="3" y="15" width="8" height="6" rx="1.5" />
  </svg>
);

export const IconUsers = (p: IconProps) => (
  <svg {...svgProps(p)}>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M2.8 20c.6-3.4 3.1-5.2 6.2-5.2s5.6 1.8 6.2 5.2" />
    <path d="M15.5 4.9a3.2 3.2 0 0 1 0 6.2M17.8 15c1.8.7 3 2.2 3.4 4.4" />
  </svg>
);

export const IconReturn = (p: IconProps) => (
  <svg {...svgProps(p)}>
    <path d="M9 14 4 9l5-5" />
    <path d="M4 9h10a6 6 0 0 1 0 12h-3" />
  </svg>
);

export const IconCash = (p: IconProps) => (
  <svg {...svgProps(p)}>
    <rect x="2.5" y="6" width="19" height="12" rx="2" />
    <circle cx="12" cy="12" r="2.6" />
    <path d="M6 9.5v.01M18 14.5v.01" />
  </svg>
);

export const IconWrench = (p: IconProps) => (
  <svg {...svgProps(p)}>
    <path d="M14.7 6.3a4.2 4.2 0 0 0-5.6 5.2L3 17.6a2 2 0 1 0 2.9 2.9l6.1-6.1a4.2 4.2 0 0 0 5.2-5.6L14.6 11l-2.4-2.4z" />
  </svg>
);

export const IconReceipt = (p: IconProps) => (
  <svg {...svgProps(p)}>
    <path d="M5 3h14v18l-2.3-1.6L14.4 21l-2.4-1.6L9.6 21l-2.3-1.6L5 21z" />
    <path d="M9 8h6M9 12h6" />
  </svg>
);

export const IconChart = (p: IconProps) => (
  <svg {...svgProps(p)}>
    <path d="M4 4v16h16" />
    <path d="M8 16v-5M12 16V7M16 16v-8" />
  </svg>
);

export const IconGear = (p: IconProps) => (
  <svg {...svgProps(p)}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19 12a7 7 0 0 0-.15-1.4l2-1.55-2-3.46-2.35.95a7 7 0 0 0-2.42-1.4L13.7 2.6h-3.4l-.38 2.54a7 7 0 0 0-2.42 1.4l-2.35-.95-2 3.46 2 1.55a7 7 0 0 0 0 2.8l-2 1.55 2 3.46 2.35-.95a7 7 0 0 0 2.42 1.4l.38 2.54h3.4l.38-2.54a7 7 0 0 0 2.42-1.4l2.35.95 2-3.46-2-1.55c.1-.45.15-.92.15-1.4z" />
  </svg>
);

export const IconLogout = (p: IconProps) => (
  <svg {...svgProps(p)}>
    <path d="M15 4h4a1.5 1.5 0 0 1 1.5 1.5v13A1.5 1.5 0 0 1 19 20h-4" />
    <path d="M10 8l-4 4 4 4M6 12h10" />
  </svg>
);

export const IconPlus = (p: IconProps) => (
  <svg {...svgProps(p)}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const IconMinus = (p: IconProps) => (
  <svg {...svgProps(p)}>
    <path d="M5 12h14" />
  </svg>
);

export const IconSearch = (p: IconProps) => (
  <svg {...svgProps(p)}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m20 20-3.8-3.8" />
  </svg>
);

export const IconX = (p: IconProps) => (
  <svg {...svgProps(p)}>
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);

export const IconCheck = (p: IconProps) => (
  <svg {...svgProps(p)}>
    <path d="m4.5 12.5 5 5 10-11" />
  </svg>
);

export const IconAlert = (p: IconProps) => (
  <svg {...svgProps(p)}>
    <path d="M12 3.5 22 20H2z" />
    <path d="M12 10v4.5M12 17.5v.01" />
  </svg>
);

export const IconClock = (p: IconProps) => (
  <svg {...svgProps(p)}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </svg>
);

export const IconPhone = (p: IconProps) => (
  <svg {...svgProps(p)}>
    <path d="M5.5 4h3l1.5 4-2 1.5a12 12 0 0 0 6.5 6.5L16 14l4 1.5v3A1.8 1.8 0 0 1 18 20 15.5 15.5 0 0 1 4 6a1.8 1.8 0 0 1 1.5-2z" />
  </svg>
);

export const IconIdCard = (p: IconProps) => (
  <svg {...svgProps(p)}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <circle cx="8.5" cy="11" r="2" />
    <path d="M5.5 16c.4-1.6 1.6-2.5 3-2.5s2.6.9 3 2.5M14 9.5h4.5M14 13h4.5" />
  </svg>
);

export const IconHistory = (p: IconProps) => (
  <svg {...svgProps(p)}>
    <path d="M3.5 12a8.5 8.5 0 1 0 2.5-6L3.5 8.5" />
    <path d="M3.5 4v4.5H8M12 8v4.5l3 1.8" />
  </svg>
);

export const IconArrowRight = (p: IconProps) => (
  <svg {...svgProps(p)}>
    <path d="M4 12h16M14 6l6 6-6 6" />
  </svg>
);

export const IconArrowLeft = (p: IconProps) => (
  <svg {...svgProps(p)}>
    <path d="M19 12H5M11 6l-6 6 6 6" />
  </svg>
);

export const IconLock = (p: IconProps) => (
  <svg {...svgProps(p)}>
    <rect x="5" y="10.5" width="14" height="10" rx="2" />
    <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5M12 14.5v2.5" />
  </svg>
);

export const IconUser = (p: IconProps) => (
  <svg {...svgProps(p)}>
    <circle cx="12" cy="8" r="3.5" />
    <path d="M5 20.5c.7-3.8 3.6-5.8 7-5.8s6.3 2 7 5.8" />
  </svg>
);

export const IconBox = (p: IconProps) => (
  <svg {...svgProps(p)}>
    <path d="m12 3 8.5 4.5v9L12 21l-8.5-4.5v-9z" />
    <path d="M3.5 7.5 12 12l8.5-4.5M12 12v9" />
  </svg>
);

export const IconEdit = (p: IconProps) => (
  <svg {...svgProps(p)}>
    <path d="M4 20h4.5L20 8.5a2.1 2.1 0 0 0-3-3L5.5 17z" />
    <path d="m14.5 7 3 3" />
  </svg>
);

export const IconCalendar = (p: IconProps) => (
  <svg {...svgProps(p)}>
    <rect x="3.5" y="5" width="17" height="16" rx="2" />
    <path d="M3.5 9.5h17M8 3v4M16 3v4" />
  </svg>
);

export const IconFlag = (p: IconProps) => (
  <svg {...svgProps(p)}>
    <path d="M5 21V4" />
    <path d="M5 4.5C7 3 9.5 3 11.5 4.5S16.5 6 19 4.8v9c-2.5 1.2-5 .8-7-.7s-4.5-1.5-7 0" />
  </svg>
);

export const IconWallet = (p: IconProps) => (
  <svg {...svgProps(p)}>
    <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5h11A2.5 2.5 0 0 1 20 7.5v9a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5z" />
    <path d="M15 12.5h5v3h-5a1.5 1.5 0 0 1 0-3z" />
  </svg>
);

export const IconPrint = (p: IconProps) => (
  <svg {...svgProps(p)}>
    <path d="M7 8V3.5h10V8" />
    <rect x="4" y="8" width="16" height="8" rx="1.5" />
    <path d="M7 13.5h10v7H7z" />
    <path d="M17.2 10.8v.01" />
  </svg>
);

export const IconTimer = (p: IconProps) => (
  <svg {...svgProps(p)}>
    <circle cx="12" cy="13.5" r="7.5" />
    <path d="M12 9.5v4l2.6 2.6" />
    <path d="M9.5 2.5h5M12 2.5V6" />
  </svg>
);

export const IconGift = (p: IconProps) => (
  <svg {...svgProps(p)}>
    <rect x="3.5" y="8" width="17" height="4" rx="1" />
    <path d="M5.5 12v8.5h13V12M12 8v12.5" />
    <path d="M12 8s-4.8.3-5.5-2.2C6 3.9 8.6 2.6 10 4c1.5 1.5 2 4 2 4zM12 8s4.8.3 5.5-2.2C18 3.9 15.4 2.6 14 4c-1.5 1.5-2 4-2 4z" />
  </svg>
);

export const IconDownload = (p: IconProps) => (
  <svg {...svgProps(p)}>
    <path d="M12 3.5V15m0 0 4-4m-4 4-4-4" />
    <path d="M4.5 16.5v2a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-2" />
  </svg>
);

export const IconUpload = (p: IconProps) => (
  <svg {...svgProps(p)}>
    <path d="M12 15V3.5m0 0 4 4m-4-4-4 4" />
    <path d="M4.5 16.5v2a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-2" />
  </svg>
);

export const IconDatabase = (p: IconProps) => (
  <svg {...svgProps(p)}>
    <ellipse cx="12" cy="5.5" rx="7.5" ry="2.8" />
    <path d="M4.5 5.5v13c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8v-13" />
    <path d="M4.5 12c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8" />
  </svg>
);

export const IconFileText = (p: IconProps) => (
  <svg {...svgProps(p)}>
    <path d="M6 3.5h8l4 4v13H6z" />
    <path d="M14 3.5v4h4" />
    <path d="M9 12.5h6M9 16h6" />
  </svg>
);
