/** Mobile-first spacing scale — use with cn() or Tailwind arbitrary values */
export const space = {
  pageX: "px-4 lg:px-6",
  pageY: "py-4 lg:py-6",
  page: "px-4 py-4 lg:px-6 lg:py-6",
  section: "gap-3 lg:gap-4",
  stack: "gap-2 lg:gap-3",
  listRow: "min-h-[52px] lg:min-h-[44px]",
  touch: "min-h-[44px] min-w-[44px]",
  cardRadius: "rounded-2xl lg:rounded-[20px]",
  cardPadding: "p-4 lg:p-5",
  tabBarInset: "pb-[calc(72px+env(safe-area-inset-bottom))] lg:pb-0",
} as const;

/** Fixed pixel values for JS/layout calculations */
export const spacePx = {
  pageX: 16,
  pageXLg: 24,
  tabBarHeight: 72,
  touchMin: 44,
  listRowMin: 52,
} as const;
