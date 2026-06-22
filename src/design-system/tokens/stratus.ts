/** Stratus theme palette — canonical DS values (single source of truth). */
export const stratusPalette = {
  blue: "#83a2db",
  salmon: "#fd8e8c",
  yellow: "#ffce87",
  black: "#293042",
  ink: "#0d0d0d",
  white: "#ffffff",
  canvas: "#f6f7fa",
  canvasPreview: "#eef4fd",
  borderLight: "#d4e3f5",
} as const;

export const stratusRgb = {
  blue: "131, 162, 219",
  salmon: "253, 142, 140",
  yellow: "255, 206, 135",
} as const;

/** DS gradient bar: blue → salmon → yellow */
export const stratusGradient = `linear-gradient(135deg, ${stratusPalette.blue} 0%, ${stratusPalette.salmon} 50%, ${stratusPalette.yellow} 100%)`;

/** Accent gradient for interactive surfaces (yellow → salmon) */
/** Selected nav / tab highlight gradient */
export const stratusNavActiveGradient = `linear-gradient(135deg, rgba(255, 206, 135, 0.92) 0%, rgba(255, 228, 185, 0.78) 50%, rgba(255, 245, 225, 0.68) 100%)`;

export const stratusYellowGradient = `linear-gradient(135deg, ${stratusPalette.yellow} 0%, #e8c8c6 55%, ${stratusPalette.salmon} 100%)`;

export const stratusPaletteLegend = [
  { label: "Blue", hex: stratusPalette.blue },
  { label: "Salmon", hex: stratusPalette.salmon },
  { label: "Yellow", hex: stratusPalette.yellow },
] as const;
