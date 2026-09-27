import confetti from 'canvas-confetti';

/**
 * Declares vibration / haptic feedback types and canvas confetti bursts
 */
export type HapticType = 'selection' | 'light' | 'medium' | 'heavy' | 'success' | 'double' | 'heartbeat' | 'error';

export function triggerHaptic(type: HapticType = 'light') {
  if (typeof window !== 'undefined' && 'vibrate' in navigator) {
    try {
      switch (type) {
        case 'selection':
          navigator.vibrate(8);
          break;
        case 'light':
          navigator.vibrate(14);
          break;
        case 'medium':
          navigator.vibrate(25);
          break;
        case 'heavy':
          navigator.vibrate(45);
          break;
        case 'double':
          navigator.vibrate([15, 30, 15]);
          break;
        case 'heartbeat':
          navigator.vibrate([20, 60, 30]);
          break;
        case 'success':
          navigator.vibrate([15, 40, 25, 40, 30]);
          break;
        case 'error':
          navigator.vibrate([30, 50, 30, 50, 30]);
          break;
      }
    } catch {
      // Ignore vibration errors if restricted by iframe permissions or user device
    }
  }
}

export function triggerConfetti(originY = 0.6) {
  if (typeof window === 'undefined') return;
  requestAnimationFrame(() => {
    try {
      confetti({
        particleCount: 40,
        spread: 50,
        origin: { y: originY },
        colors: ['#f43f5e', '#ec4899', '#f59e0b', '#10b981', '#3b82f6'],
        disableForReducedMotion: true,
      });
    } catch {
      // Ignore canvas errors
    }
  });
}

export function triggerHeartBurst(x = 0.5, y = 0.5) {
  if (typeof window === 'undefined') return;
  requestAnimationFrame(() => {
    try {
      confetti({
        particleCount: 20,
        angle: 90,
        spread: 40,
        origin: { x, y },
        colors: ['#f43f5e', '#f472b6', '#fb7185', '#ffe4e6'],
        shapes: ['square'],
        scalar: 1.0,
        disableForReducedMotion: true,
      });
    } catch {
      // Ignore canvas errors
    }
  });
}
