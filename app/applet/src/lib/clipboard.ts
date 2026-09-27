import { Clipboard } from '@capacitor/clipboard';
import { Capacitor } from '@capacitor/core';

/**
 * Ultra-fast, bulletproof clipboard helper.
 * Guaranteed never to freeze the UI, hang indefinitely, or trigger WebKit selection deadlocks on iOS.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (!text) return false;

  // 1. Try Native Capacitor Clipboard with strict 500ms timeout
  if (Capacitor.isNativePlatform()) {
    try {
      const isAvailable =
        typeof Capacitor.isPluginAvailable === 'function'
          ? Capacitor.isPluginAvailable('Clipboard')
          : true;

      if (isAvailable && Clipboard && typeof Clipboard.write === 'function') {
        const nativePromise = Clipboard.write({ string: text }).then(() => true);
        const timeoutPromise = new Promise<boolean>((resolve) =>
          setTimeout(() => resolve(false), 500)
        );
        const success = await Promise.race([nativePromise, timeoutPromise]);
        if (success) return true;
      }
    } catch (e) {
      console.warn('[Clipboard] Native write notice:', e);
    }
  }

  // 2. Modern Web Clipboard API with 500ms timeout
  if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    try {
      const webPromise = navigator.clipboard.writeText(text).then(() => true);
      const timeoutPromise = new Promise<boolean>((resolve) =>
        setTimeout(() => resolve(false), 500)
      );
      const success = await Promise.race([webPromise, timeoutPromise]);
      if (success) return true;
    } catch (err) {
      console.warn('[Clipboard] Navigator writeText notice:', err);
    }
  }

  // 3. Ultra-safe iOS WebKit & browser fallback
  // NEVER use an offscreen textarea at -9999px with select() + immediate removeChild(),
  // which causes WKWebView layout deadlocks / UI freezes on iOS.
  try {
    const el = document.createElement('textarea');
    el.value = text;
    el.setAttribute('readonly', '');
    el.setAttribute('tabindex', '-1');
    el.setAttribute('aria-hidden', 'true');
    el.style.position = 'fixed';
    el.style.top = '0';
    el.style.left = '0';
    el.style.width = '1px';
    el.style.height = '1px';
    el.style.padding = '0';
    el.style.border = 'none';
    el.style.outline = 'none';
    el.style.background = 'transparent';
    el.style.opacity = '0.01';
    el.style.pointerEvents = 'none';

    document.body.appendChild(el);
    el.setSelectionRange(0, text.length);
    const successful = document.execCommand('copy');

    // Defer element removal so WebKit text responder finishes its runloop cycle safely
    setTimeout(() => {
      try {
        if (el.parentNode) el.parentNode.removeChild(el);
      } catch {}
    }, 100);

    return Boolean(successful);
  } catch (fallbackErr) {
    console.warn('[Clipboard] Fallback copy notice:', fallbackErr);
    return false;
  }
}
