/**
 * Utilities for rendering 10-step segmented / gradient-filled flame icons
 * according to spot scores (0 to 10 scale).
 *
 * Rules:
 * - Score = 10.0 (or >= 9.95) -> 10/10ths filled (100% full flame)
 * - Score = 9.8 (or 9.x) -> 9/10ths filled (lacks the top 1/10th)
 * - Score = 7.6 (or 7.x) -> 7/10ths filled (lacks top 3/10ths, clear accentuation)
 * - Score = 4.3 (or 4.x) -> 4/10ths filled (lacks top 6/10ths)
 * - Full outer contour and ghost silhouette are always 100% visible.
 */

export function getFlameTenths(score?: number | null): number {
  if (score === undefined || score === null || isNaN(score)) return 8;
  if (score >= 9.95) return 10;
  if (score < 1.0) return 1;
  return Math.floor(score);
}

export function getFlameFillClip(tenths: number): { clipY: number; clipHeight: number; fillPercent: number } {
  const flameTop = 3.0;
  const flameBottom = 21.0;
  const flameHeight = flameBottom - flameTop; // 18.0
  const clampedTenths = Math.max(1, Math.min(10, tenths));
  const ratio = clampedTenths / 10.0;
  const clipY = flameBottom - ratio * flameHeight;
  const clipHeight = flameBottom - clipY + 3.0; // extends down past bottom curve
  return {
    clipY: Number(clipY.toFixed(2)),
    clipHeight: Number(clipHeight.toFixed(2)),
    fillPercent: clampedTenths * 10,
  };
}

export interface FlameSvgOptions {
  score?: number | null;
  isSelected?: boolean;
  size?: number;
  idSuffix?: string;
  isDarkMap?: boolean;
  strokeColor?: string;
}

export function generateFlameSvgString({
  score,
  isSelected = false,
  size = 18,
  idSuffix = Math.random().toString(36).substring(2, 7),
  isDarkMap = true,
  strokeColor,
}: FlameSvgOptions): string {
  const tenths = getFlameTenths(score);
  const { clipY, clipHeight } = getFlameFillClip(tenths);

  const gradId = `flame-grad-${idSuffix}`;
  const clipId = `flame-clip-${idSuffix}`;

  const stroke = strokeColor
    ? strokeColor
    : isSelected
    ? '#ffffff'
    : tenths >= 8
    ? '#f43f5e'
    : tenths >= 5
    ? '#f97316'
    : '#eab308';

  const ghostFill = isDarkMap ? 'rgba(255, 255, 255, 0.15)' : 'rgba(15, 23, 42, 0.15)';

  return `
    <svg
      viewBox="0 0 24 24"
      width="${size}"
      height="${size}"
      style="overflow: visible; display: inline-block; vertical-align: middle; flex-shrink: 0;"
    >
      <defs>
        <linearGradient id="${gradId}" x1="0%" y1="100%" x2="0%" y2="0%">
          <stop offset="0%" stop-color="#f59e0b" />
          <stop offset="50%" stop-color="#f97316" />
          <stop offset="100%" stop-color="#f43f5e" />
        </linearGradient>

        <clipPath id="${clipId}">
          <rect x="0" y="${clipY}" width="24" height="${clipHeight}" />
        </clipPath>
      </defs>

      <!-- 1. Background ghost silhouette of the full flame shape -->
      <path
        d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 3z"
        fill="${ghostFill}"
      />

      <!-- 2. Filled body clipped exactly to the 10th level step -->
      <path
        d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 3z"
        fill="url(#${gradId})"
        clip-path="url(#${clipId})"
      />

      <!-- 3. Inner spark contour -->
      <path
        d="M12 18a2 2 0 0 0 2-2c0-.8-.4-1.3-.8-1.8-.7-.9-.5-1.8.3-2.7.2 1.1.9 2 1.5 2.5.7.7 1 1.4 1 2a4 4 0 0 1-8 0c0-.5.2-1 .5-1.5a1.5 1.5 0 0 0 1.5 1.5c1 0 2 1 2 2z"
        fill="rgba(255, 255, 255, 0.45)"
        clip-path="url(#${clipId})"
      />

      <!-- 4. Crisp full outer contour always 100% visible -->
      <path
        d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 3z"
        fill="none"
        stroke="${stroke}"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  `;
}
