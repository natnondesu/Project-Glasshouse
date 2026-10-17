import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

const frame = (size: number) =>
  ({ width: size, height: size, viewBox: `0 0 ${size} ${size}`, fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, 'aria-hidden': true }) as const;

export const GlasshouseMark = (p: IconProps) => (
  <svg {...frame(22)} strokeWidth={1.75} {...p}>
    <rect x="1.5" y="1.5" width="19" height="19" />
    <path d="M11 1.5V20.5M1.5 11H20.5" />
    <path d="M4 8L8 4M14 18L18 14" strokeWidth={1} />
  </svg>
);
export const IconSelect = (p: IconProps) => (
  <svg {...frame(18)} {...p}>
    <path d="M4 2.5L14 9L9.5 10L12 15L10 16L7.5 11L4 14Z" strokeLinejoin="round" />
  </svg>
);
export const IconPan = (p: IconProps) => (
  <svg {...frame(18)} {...p}>
    <path d="M9 1.5V16.5M1.5 9H16.5M9 1.5L7 3.5M9 1.5L11 3.5M9 16.5L7 14.5M9 16.5L11 14.5M1.5 9L3.5 7M1.5 9L3.5 11M16.5 9L14.5 7M16.5 9L14.5 11" />
  </svg>
);
export const IconArea = (p: IconProps) => (
  <svg {...frame(18)} {...p}>
    <rect x="2" y="2" width="14" height="14" />
    <path d="M9 5.5V12.5M5.5 9H12.5" />
  </svg>
);
export const IconCut = (p: IconProps) => (
  <svg {...frame(18)} {...p}>
    <rect x="2" y="2" width="14" height="14" strokeDasharray="3 2" />
    <path d="M5.5 9H12.5" />
  </svg>
);
export const IconRack = (p: IconProps) => (
  <svg {...frame(18)} {...p}>
    <rect x="4.5" y="1.5" width="9" height="15" />
    <path d="M4.5 16.5H13.5" strokeWidth={3} />
    <path d="M7 5H11M7 8H11M7 11H11" strokeWidth={1} />
  </svg>
);
export const IconDoor = (p: IconProps) => (
  <svg {...frame(18)} {...p}>
    <path d="M3 16V3M3 3A13 13 0 0 1 16 16M2 16H16" />
  </svg>
);
export const IconSlidingDoor = (p: IconProps) => (
  <svg {...frame(18)} {...p}>
    <path d="M2 16H16M3 16V9M10 16V9M3 6.5H16M9.5 6.5H16" />
    <path d="M9.5 4.5H16" strokeWidth={2.5} />
    <path d="M5 12H8.5M7 10.5L8.5 12L7 13.5" />
  </svg>
);
export const IconMcb = (p: IconProps) => (
  <svg {...frame(18)} {...p}>
    <rect x="3" y="2" width="12" height="14" />
    <path d="M10 4.5L7 9.5H11L8 13.5" />
  </svg>
);
export const IconExistingRack = (p: IconProps) => (
  <svg {...frame(18)} {...p}>
    <rect x="4.5" y="1.5" width="9" height="15" />
    <path d="M4.5 1.5L13.5 16.5M13.5 1.5L4.5 16.5" strokeWidth={1} />
  </svg>
);
export const IconFurniture = (p: IconProps) => (
  <svg {...frame(18)} {...p}>
    <rect x="2" y="5" width="14" height="6" />
    <path d="M4 11V15M14 11V15" />
  </svg>
);
export const IconPlus = (p: IconProps) => (
  <svg {...frame(14)} {...p}>
    <path d="M7 2V12M2 7H12" />
  </svg>
);
export const IconMinus = (p: IconProps) => (
  <svg {...frame(14)} {...p}>
    <path d="M2 7H12" />
  </svg>
);
export const IconPencil = (p: IconProps) => (
  <svg {...frame(14)} {...p}>
    <path d="M2 12L2.6 9.4L9.6 2.4L11.6 4.4L4.6 11.4Z" strokeLinejoin="round" />
  </svg>
);
export const IconTrash = (p: IconProps) => (
  <svg {...frame(14)} {...p}>
    <path d="M2 3.5H12M5.5 3.5V2H8.5V3.5M3.5 3.5L4 12H10L10.5 3.5" strokeLinejoin="round" />
  </svg>
);
export const IconRotateCw = (p: IconProps) => (
  <svg {...frame(16)} {...p}>
    <path d="M12.5 6A5 5 0 1 0 12 11" />
    <path d="M13.5 2.5V6.5H9.5" />
  </svg>
);
export const IconRotateCcw = (p: IconProps) => (
  <svg {...frame(16)} {...p}>
    <path d="M3.5 6A5 5 0 1 1 4 11" />
    <path d="M2.5 2.5V6.5H6.5" />
  </svg>
);
export const IconBlock = (p: IconProps) => (
  <svg {...frame(20)} strokeWidth={1.75} {...p}>
    <circle cx="10" cy="10" r="8" className="sev-fill" />
    <path d="M10 6V11M10 13.6V14.4" strokeWidth={2} strokeLinecap="round" />
  </svg>
);
export const IconWarn = (p: IconProps) => (
  <svg {...frame(20)} strokeWidth={1.75} {...p}>
    <circle cx="10" cy="10" r="8" strokeDasharray="3 2" className="sev-fill" />
    <path d="M8 7.8A2 2 0 1 1 10 10V11.2M10 13.6V14.4" strokeLinecap="round" />
  </svg>
);
export const IconMeasure = (p: IconProps) => (
  <svg {...frame(18)} {...p}>
    <path d="M2.5 12.5L12.5 2.5L15.5 5.5L5.5 15.5Z" strokeLinejoin="round" />
    <path d="M6 9L7.5 10.5M8.5 6.5L10 8M11 4L12.5 5.5" strokeWidth={1.2} />
  </svg>
);
export const IconUpload = (p: IconProps) => (
  <svg {...frame(14)} {...p}>
    <path d="M7 10V2.5M4 5.5L7 2.5L10 5.5M2 12H12" />
  </svg>
);
export const IconDownload = (p: IconProps) => (
  <svg {...frame(14)} {...p}>
    <path d="M7 2V9.5M4 6.5L7 9.5L10 6.5M2 12H12" />
  </svg>
);
export const IconChevronLeft = (p: IconProps) => (
  <svg {...frame(14)} {...p}>
    <path d="M8.5 3L4.5 7L8.5 11" />
  </svg>
);
export const IconChevronRight = (p: IconProps) => (
  <svg {...frame(14)} {...p}>
    <path d="M5.5 3L9.5 7L5.5 11" />
  </svg>
);
export const IconDimension = (p: IconProps) => (
  <svg {...frame(18)} {...p}>
    <path d="M2.5 5V13M15.5 5V13M2.5 9H15.5" />
    <path d="M1 10.5L4 7.5M14 10.5L17 7.5" strokeWidth={1.2} />
  </svg>
);
export const IconWallPlug = (p: IconProps) => (
  <svg {...frame(18)} {...p}>
    <rect x="3.5" y="3.5" width="11" height="11" rx="2" />
    <path d="M7 7.5V9.5M11 7.5V9.5M7.5 12H10.5" />
  </svg>
);
export const IconIndustrialSocket = (p: IconProps) => (
  <svg {...frame(18)} {...p}>
    <circle cx="9" cy="9" r="6" />
    <circle cx="9" cy="5.8" r="0.9" fill="currentColor" />
    <circle cx="6.2" cy="10.6" r="0.9" fill="currentColor" />
    <circle cx="11.8" cy="10.6" r="0.9" fill="currentColor" />
  </svg>
);
export const IconFloorBox = (p: IconProps) => (
  <svg {...frame(18)} {...p}>
    <rect x="3" y="3" width="12" height="12" />
    <path d="M3 15L15 3" strokeWidth={1} />
    <circle cx="9" cy="9" r="2.2" />
  </svg>
);
export const IconUps = (p: IconProps) => (
  <svg {...frame(18)} {...p}>
    <rect x="4.5" y="2" width="9" height="14" rx="1" />
    <path d="M7 6H11M9.5 9L8 11.5H10L8.5 14" strokeWidth={1.2} />
  </svg>
);
export const IconPdu = (p: IconProps) => (
  <svg {...frame(18)} {...p}>
    <rect x="3" y="3" width="12" height="12" />
    <path d="M5.5 7H7M8.5 7H10M11.5 7H13M5.5 11H7M8.5 11H10M11.5 11H13" strokeWidth={1.4} />
  </svg>
);
export const IconChevronCorner = (p: IconProps) => (
  <svg width="7" height="7" viewBox="0 0 7 7" aria-hidden="true" {...p}>
    <path d="M7 0V7H0Z" fill="currentColor" />
  </svg>
);
export const IconLock = (p: IconProps) => (
  <svg {...frame(14)} {...p}>
    <rect x="2.5" y="6.25" width="9" height="6.25" rx="1" />
    <path d="M4.5 6.25V4.5a2.5 2.5 0 0 1 5 0v1.75" />
  </svg>
);
export const IconClose = (p: IconProps) => (
  <svg {...frame(12)} {...p}>
    <path d="M3 3L9 9M9 3L3 9" />
  </svg>
);
export const IconSearch = (p: IconProps) => (
  <svg {...frame(14)} {...p}>
    <circle cx="6" cy="6" r="4.2" />
    <path d="M9.2 9.2L12.5 12.5" />
  </svg>
);
export const IconWallRack = (p: IconProps) => (
  <svg {...frame(18)} {...p}>
    <path d="M2.5 2V16" strokeWidth={2} />
    <rect x="5" y="4" width="9" height="7.5" strokeDasharray="2 1.5" />
    <path d="M7 6.5H12M7 9H12" />
  </svg>
);
export const IconPause = (p: IconProps) => (
  <svg {...frame(16)} strokeWidth={2.2} strokeLinecap="round" {...p}>
    <path d="M5 3V13M11 3V13" />
  </svg>
);
export const IconPlay = (p: IconProps) => (
  <svg {...frame(16)} strokeLinejoin="round" {...p}>
    <path d="M5 3L13 8L5 13Z" fill="currentColor" />
  </svg>
);
export const IconArrowRight = (p: IconProps) => (
  <svg {...frame(16)} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" {...p}>
    <path d="M3 8H12.5M8.5 4L12.5 8L8.5 12" />
  </svg>
);
export const IconCheck = (p: IconProps) => (
  <svg {...frame(14)} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" {...p}>
    <path d="M2.5 7.5L5.5 10.5L11.5 3.5" />
  </svg>
);
export const IconGrip = (p: IconProps) => (
  <svg {...frame(14)} stroke="none" fill="currentColor" {...p}>
    {[3.5, 7, 10.5].flatMap((y) => [5, 9].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.2" />))}
  </svg>
);
export const IconCatalog = (p: IconProps) => (
  <svg {...frame(16)} {...p}>
    <rect x="2.5" y="2.5" width="11" height="3" rx="0.6" />
    <rect x="2.5" y="6.5" width="11" height="3" rx="0.6" />
    <rect x="2.5" y="10.5" width="11" height="3" rx="0.6" />
    <path d="M4.5 4h1.5M4.5 8h1.5M4.5 12h1.5" />
  </svg>
);
