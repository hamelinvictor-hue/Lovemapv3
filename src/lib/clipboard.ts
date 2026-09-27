import { Clipboard } from '@capacitor/clipboard';
import { Capacitor } from '@capacitor/core';

export async function copyToClipboard(text: string): Promise<boolean> {
  if (!text) return false;
  
  // 1. Native Capacitor Clipboard (Instant, 0ms, zero permissions lag on iOS/Android)
  if (Capacitor.isNativePlatform()) {
    try {
      await Clipboard.write({ string: text });
      return true;
    } catch (e) {
      console.warn('[Clipboard] Native write notice:', e);
    }
  }

  // 2. Modern Web Clipboard API
  if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      console.warn('[Clipboard] Navigator writeText notice:', err);
    }
  }

  // 3. Fallback for older browsers without input focus popup
  try {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.setAttribute('readonly', '');
    textArea.style.contain = 'strict';
    textArea.style.position = 'absolute';
    textArea.style.left = '-9999px';
    textArea.style.fontSize = '12pt'; // Prevent auto-zoom in iOS Safari
    document.body.appendChild(textArea);
    textArea.select();
    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);
    return successful;
  } catch (fallbackErr) {
    console.warn('[Clipboard] Fallback copy failed:', fallbackErr);
    return false;
  }
}
