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
  menu: <path d="M3 5h14M3 10h14M3 15h14" />,
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
  check: <path d="m4 10 4 4 8-8" />,
  chevronLeft: <path d="m12 5-5 5 5 5" />,
  chevronRight: <path d="m8 5 5 5-5 5" />,
  chevronDown: <path d="m5 8 5 5 5-5" />,
  arrowLeft: <path d="M16 10H4M9 5l-5 5 5 5" />,
  arrowRight: <path d="M4 10h12M11 5l5 5-5 5" />,
  arrowUp: <path d="M10 16V4M5 9l5-5 5 5" />,
  arrowDown: <path d="M10 4v12M5 11l5 5 5-5" />,
  trash: (
    <>
      <path d="M3.5 5.5h13M8 5.5V3.5h4v2M5 5.5l.8 11a1 1 0 0 0 1 .9h6.4a1 1 0 0 0 1-.9l.8-11" />
      <path d="M8.5 8.5v6M11.5 8.5v6" />
    </>
  ),
  more: (
    <>
      <circle cx="4.5" cy="10" r="0.8" />
      <circle cx="10" cy="10" r="0.8" />
      <circle cx="15.5" cy="10" r="0.8" />
    </>
  ),
  stop: <rect x="5" y="5" width="10" height="10" rx="1" />,
  grip: (
    <>
      <circle cx="7.5" cy="5" r="1.1" />
      <circle cx="12.5" cy="5" r="1.1" />
      <circle cx="7.5" cy="10" r="1.1" />
      <circle cx="12.5" cy="10" r="1.1" />
      <circle cx="7.5" cy="15" r="1.1" />
      <circle cx="12.5" cy="15" r="1.1" />
    </>
  ),
  restart: (
    <>
      <path d="M16 10a6 6 0 1 1-1.8-4.3" />
      <path d="M16 3.5v3.5h-3.5" />
    </>
  ),
  save: (
    <>
      <path d="M4.5 3.5h9l3 3v9a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1v-11a1 1 0 0 1 1-1z" />
      <path d="M7 3.5v4h6v-4M6.5 16.5v-5h7v5" />
    </>
  ),
  download: (
    <>
      <path d="M10 3.5V13M6 9l4 4 4-4" />
      <path d="M3.5 13.5v2a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-2" />
    </>
  ),
  copy: (
    <>
      <rect x="7" y="7" width="9.5" height="9.5" rx="1" />
      <path d="M13 7V4.5a1 1 0 0 0-1-1H4.5a1 1 0 0 0-1 1V12a1 1 0 0 0 1 1H7" />
    </>
  ),
  code: <path d="m7 6-4 4 4 4M13 6l4 4-4 4" />,
  text: <path d="M4 5h12M10 5v11M7 16h6" />,
  eraser: (
    <>
      <path d="m8 16.5-4.3-4.3a1 1 0 0 1 0-1.4l7-7a1 1 0 0 1 1.4 0l4.3 4.3a1 1 0 0 1 0 1.4l-7 7z" />
      <path d="M8 16.5h8.5M6.5 8l5.5 5.5" />
    </>
  ),
  folder: <path d="M2.5 5.5a1 1 0 0 1 1-1h4l2 2h7a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1z" />,
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
  edit: (
    <>
      <path d="M12.5 4.5l3 3L7 16H4v-3z" />
      <path d="M11 6l3 3" />
    </>
  ),
  refresh: (
    <>
      <path d="M16 10a6 6 0 1 1-1.8-4.3" />
      <path d="M16 3.5v3.5h-3.5" />
    </>
  ),
  alert: (
    <>
      <circle cx="10" cy="10" r="7" />
      <path d="M10 6.5v4M10 13.5v.01" />
    </>
  ),
  // A panel with a column on the left: the menu (collapse / open it).
  sidebar: (
    <>
      <rect x="2.5" y="3.5" width="15" height="13" rx="2.5" />
      <path d="M7.5 3.5v13" />
    </>
  ),
  // A panel with a column on the right: pin the notebook beside the chat.
  dock: (
    <>
      <rect x="2.5" y="3.5" width="15" height="13" rx="2.5" />
      <path d="M11.5 3.5v13" />
    </>
  ),
  external: (
    <>
      <path d="M11.5 3.5h5v5M16.5 3.5 9 11" />
      <path d="M15 11.5v4a1 1 0 0 1-1 1H4.5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h4" />
    </>
  ),
  expand: <path d="M12.5 3.5h4v4M7.5 16.5h-4v-4M16.5 3.5l-5.5 5.5M3.5 16.5 9 11" />,
  collapse: <path d="M3.5 11.5h5v5M16.5 8.5h-5v-5M11.5 8.5l5.5-5.5M3 17l5.5-5.5" />,
  chat: <path d="M17 10a6.5 6.5 0 0 1-9.4 5.8L3.5 17l.9-3.8A6.5 6.5 0 1 1 17 10z" />,
  image: (
    <>
      <rect x="3" y="3.5" width="14" height="13" rx="2" />
      <circle cx="7.5" cy="8" r="1.5" />
      <path d="m3.5 15 4.5-4.5 3 3 2-2 3.5 3.5" />
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
