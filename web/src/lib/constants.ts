/** Layout constants — Craft-style panel dimensions */

export const LAYOUT = {
  LEFT_SIDEBAR_WIDTH: 220,
  SESSION_LIST_WIDTH: 280,
  PANEL_GAP: 6,
  PANEL_PADDING: 6,
  PANEL_MIN_WIDTH: 440,
  PANEL_HEADER_HEIGHT: 42,
  CHAT_MAX_WIDTH: 840,
  CHAT_PADDING_X: 20,
  CHAT_PADDING_Y: 32,
  MESSAGE_GAP: 10, // space-y-2.5
  USER_MSG_MAX_WIDTH_PERCENT: 80,
} as const;

export const RADIUS = {
  OUTER: 14,
  INNER: 10,
  PILL: 9999,
} as const;

export const ANIMATION = {
  SPRING_STIFFNESS: 600,
  SPRING_DAMPING: 49,
  STAGGER_DELAY: 40, // ms between child entrances
} as const;
