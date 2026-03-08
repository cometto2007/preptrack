import { useState, useEffect } from 'react';

const DISMISS_KEY = 'pwa-install-dismissed';

/**
 * Returns { canInstall, install, dismiss } — handles the beforeinstallprompt event.
 * `install()` triggers the native browser install dialog.
 * `dismiss()` hides the banner permanently (persisted in localStorage).
 */
export function useInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem(DISMISS_KEY) === '1'
  );

  useEffect(() => {
    if (dismissed) return;
    function onPrompt(e) {
      e.preventDefault();
      setDeferredPrompt(e);
    }
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, [dismissed]);

  async function install() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
  }

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, '1');
    setDismissed(true);
    setDeferredPrompt(null);
  }

  return { canInstall: !!deferredPrompt && !dismissed, install, dismiss };
}
