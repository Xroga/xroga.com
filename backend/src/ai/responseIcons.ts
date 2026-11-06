/** Lucide icon names the model may attach to cards and steps. The frontend renders only names in its own copy of this list
 * (frontend/src/lib/responseIcons.ts) and ignores anything else, so an icon is decoration and never carries meaning alone. */
export const RESPONSE_ICONS = [
  'home', 'building', 'bed', 'map-pin', 'plane', 'car', 'train', 'hotel', 'utensils', 'camera',
  'dollar-sign', 'credit-card', 'percent', 'trending-up', 'trending-down', 'bar-chart', 'pie-chart', 'line-chart', 'wallet', 'receipt',
  'shield', 'lock', 'key', 'scale', 'gavel', 'file-text', 'clipboard', 'check-circle', 'alert-triangle', 'info',
  'heart-pulse', 'stethoscope', 'pill', 'dumbbell', 'apple', 'leaf', 'sun', 'moon', 'cloud',
  'database', 'server', 'cpu', 'code', 'terminal', 'git-branch', 'workflow', 'layers', 'globe', 'wifi',
  'users', 'user', 'briefcase', 'building-2', 'store', 'shopping-cart', 'package', 'truck', 'mail', 'phone', 'message-square',
  'book-open', 'graduation-cap', 'lightbulb', 'target', 'rocket', 'zap', 'star', 'flag', 'award', 'wrench', 'settings',
  'calendar', 'clock', 'search', 'link', 'image', 'music', 'palette', 'megaphone', 'handshake', 'puzzle',
] as const;
export type ResponseIcon = (typeof RESPONSE_ICONS)[number];
