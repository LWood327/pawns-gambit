// Small line icons for game controls. 24×24, drawn with currentColor.

const common = {
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

export const IconBack = () => (
  <svg {...common}>
    <path d="M15 5l-7 7 7 7" />
  </svg>
);

export const IconUndo = () => (
  <svg {...common}>
    <path d="M9 7L4 12l5 5" />
    <path d="M4 12h10a6 6 0 0 1 0 12h-2" transform="translate(0 -6)" />
  </svg>
);

export const IconFlip = () => (
  <svg {...common}>
    <path d="M7 4v16M7 4L3.5 7.5M7 4l3.5 3.5" />
    <path d="M17 20V4M17 20l-3.5-3.5M17 20l3.5-3.5" />
  </svg>
);

export const IconFlag = () => (
  <svg {...common}>
    <path d="M5 21V4" />
    <path d="M5 4h11l-2 4 2 4H5" />
  </svg>
);

export const IconEye = () => (
  <svg {...common}>
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

export const IconSound = ({ muted }: { muted: boolean }) => (
  <svg {...common}>
    <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" />
    {muted ? (
      <path d="M16 9.5l5 5M21 9.5l-5 5" />
    ) : (
      <>
        <path d="M15.5 9a4 4 0 0 1 0 6" />
        <path d="M18 6.5a7.5 7.5 0 0 1 0 11" />
      </>
    )}
  </svg>
);
