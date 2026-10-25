/*
  Simple line icons used across LECTRA (drawn to match the Figma icon set).
  Usage: <Icon name="upload" />  — size defaults to 18px and the colour follows the text colour.
*/
const PATHS = {
  book: (
    <>
      <path d="M2 5.5c2.5-1 5-1 8 .8 3-1.8 5.5-1.8 8-.8v12c-2.5-1-5-1-8 .8-3-1.8-5.5-1.8-8-.8z" />
      <path d="M10 6.3v12" />
    </>
  ),
  search: (
    <>
      <circle cx="9" cy="9" r="5.5" />
      <path d="m13 13 4 4" />
    </>
  ),
  slides: (
    <>
      <rect x="2.5" y="3.5" width="15" height="10" rx="1" />
      <path d="M10 13.5V17M7 17h6" />
    </>
  ),
  fileText: (
    <>
      <path d="M11.5 2.5H5.5a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-10z" />
      <path d="M11.5 2.5v4h4M7.5 10.5h5M7.5 13.5h5" />
    </>
  ),
  notebook: (
    <>
      <rect x="4.5" y="2.5" width="11" height="15" rx="1" />
      <path d="M7.5 2.5v15M2.5 6h3M2.5 10h3M2.5 14h3" />
    </>
  ),
  upload: (
    <>
      <path d="M10 13V3.5M6 7.5l4-4 4 4" />
      <path d="M3.5 12.5v3a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-3" />
    </>
  ),
  uploadCloud: (
    <>
      <path d="M6 14.5H5a3.5 3.5 0 0 1-.4-7 5 5 0 0 1 9.7-.9A3.5 3.5 0 0 1 15 14.5h-1" />
      <path d="M10 10v7M7.5 12.5 10 10l2.5 2.5" />
    </>
  ),
  play: <path d="M6 3.5v13l10-6.5z" />,
  plus: <path d="M10 4v12M4 10h12" />,
  message: <path d="M3.5 4.5h13v9h-8l-3.5 3v-3H3.5z" />,
  send: (
    <>
      <path d="M17 3 8.5 11.5" />
      <path d="M17 3l-5 14-3.5-5.5L3 8z" />
    </>
  ),
  graduation: (
    <>
      <path d="M10 4 1.5 8 10 12l8.5-4z" />
      <path d="M5 9.7V13c1.5 1.3 3.2 2 5 2s3.5-.7 5-2V9.7" />
    </>
  ),
  user: (
    <>
      <circle cx="10" cy="7" r="3.5" />
      <path d="M3.5 17c.8-3 3.3-5 6.5-5s5.7 2 6.5 5" />
    </>
  ),
  sliders: (
    <>
      <path d="M3 6h7M14 6h3M3 14h3M10 14h7" />
      <circle cx="12" cy="6" r="2" />
      <circle cx="8" cy="14" r="2" />
    </>
  ),
  chart: <path d="M3.5 3.5v13h13M7 13.5v-4M10.5 13.5v-7M14 13.5v-5" />,
  help: (
    <>
      <circle cx="10" cy="10" r="7" />
      <path d="M8 8a2 2 0 1 1 2.8 1.8c-.5.3-.8.7-.8 1.2v.5M10 14v.01" />
    </>
  ),
  logout: (
    <>
      <path d="M8 3.5H4.5a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1H8" />
      <path d="M13 6.5 16.5 10 13 13.5M16.5 10H8" />
    </>
  ),
  close: <path d="M5 5l10 10M15 5 5 15" />,
  chevronLeft: <path d="m12 5-5 5 5 5" />,
  chevronRight: <path d="m8 5 5 5-5 5" />,
  chevronDown: <path d="m5 8 5 5 5-5" />,
  arrowLeft: <path d="M16 10H4M9 5l-5 5 5 5" />,
  zoomIn: (
    <>
      <circle cx="9" cy="9" r="5.5" />
      <path d="m13 13 4 4M7 9h4M9 7v4" />
    </>
  ),
  zoomOut: (
    <>
      <circle cx="9" cy="9" r="5.5" />
      <path d="m13 13 4 4M7 9h4" />
    </>
  ),
  eye: (
    <>
      <path d="M1.5 10S4.5 4.5 10 4.5 18.5 10 18.5 10 15.5 15.5 10 15.5 1.5 10 1.5 10z" />
      <circle cx="10" cy="10" r="2.5" />
    </>
  ),
  eyeOff: (
    <>
      <path d="M3 3l14 14" />
      <path d="M8.2 5a8.6 8.6 0 0 1 1.8-.5c5.5 0 8.5 5.5 8.5 5.5a14 14 0 0 1-2.3 3M5.6 6.3A13.7 13.7 0 0 0 1.5 10s3 5.5 8.5 5.5c1.5 0 2.8-.4 4-1" />
    </>
  ),
};

export default function Icon({ name, size = 18, strokeWidth = 1.6, className }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}

