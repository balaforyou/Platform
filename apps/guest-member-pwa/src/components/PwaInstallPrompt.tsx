import { useEffect, useState } from 'react';
import { useTenant } from '@badminton/ui-shared';
import { Smartphone, Download, Share, X } from 'lucide-react';

/**
 * PWA Install Prompt Component.
 * Suppresses default browser installer prompts, monitors installation support,
 * and displays custom white-labeled install prompts for Chrome/Android or Safari/iOS.
 * 
 * WHY:
 * 1. Chrome/Android uses beforeinstallprompt + e.preventDefault() + deferredPrompt.prompt().
 * 2. iOS Safari does not support automated prompts; we show instructions on tapping the Share button.
 * 3. Remembers dismissal state in localStorage for 7 days to avoid bothering users.
 * 
 * NOTE ON PLACEMENT:
 * Currently rendered inside MainDashboard. This is an interim trigger location.
 * Once the real guest booking flow is built, this should be moved or triggered
 * at a stronger user action point (e.g., "after a user's first successful booking").
 */
export default function PwaInstallPrompt() {
  const { tenant } = useTenant();
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [deviceType, setDeviceType] = useState<'android' | 'ios' | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    // 1. Detect if the PWA is already running in Standalone (installed) mode
    const isStandalone = 
      window.matchMedia('(display-mode: standalone)').matches || 
      (window.navigator as any).standalone === true;

    if (isStandalone) {
      console.log('PWA is already running in standalone mode. Skipping install prompt.');
      return;
    }

    // 2. Check if the user dismissed the prompt in the last 7 days
    const dismissalTime = localStorage.getItem('pwa-install-dismissed');
    if (dismissalTime) {
      const parsedTime = parseInt(dismissalTime, 10);
      const sevenDays = 7 * 24 * 60 * 60 * 1000;
      if (Date.now() - parsedTime < sevenDays) {
        console.log('PWA install prompt recently dismissed. Suppressing.');
        return;
      }
    }

    // 3. Detect iOS platform
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;

    // Helper to start the 3-second trigger delay
    function triggerShowBanner() {
      const timer = setTimeout(() => {
        setShowBanner(true);
      }, 3000);
      return timer;
    }

    // 4. Set up beforeinstallprompt listener for Android/Chrome
    const handleBeforeInstallPrompt = (e: Event) => {
      // CRITICAL: Call preventDefault() synchronously to suppress Chrome's default install banner
      e.preventDefault();
      console.log('beforeinstallprompt event fired. Suppressing browser default banner.');
      
      // Save the event so it can be triggered later
      setDeferredPrompt(e);
      setDeviceType('android');
      
      // Trigger showing the banner after a 3-second delay on dashboard load
      triggerShowBanner();
    };

    // If the event was already captured globally before this component mounted:
    if ((window as any).__deferredPrompt) {
      console.log('Using globally captured beforeinstallprompt event.');
      setDeferredPrompt((window as any).__deferredPrompt);
      setDeviceType('android');
      triggerShowBanner();
    }

    // Register callback for future events
    (window as any).__onBeforeInstallPrompt = (e: any) => {
      setDeferredPrompt(e);
      setDeviceType('android');
      triggerShowBanner();
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // 5. Track if the app was successfully installed (appinstalled listener)
    const handleAppInstalled = () => {
      console.log('App was successfully installed.');
      setInstalled(true);
      setShowBanner(false);
      setDeferredPrompt(null);
    };
    window.addEventListener('appinstalled', handleAppInstalled);

    // 6. If iOS, trigger the share instructions banner after 3 seconds (since beforeinstallprompt never fires)
    if (isIOS) {
      setDeviceType('ios');
      triggerShowBanner();
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      (window as any).__onBeforeInstallPrompt = null;
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;

    // Trigger Chrome's native prompt using our saved event
    deferredPrompt.prompt();

    // Wait for the user's choice
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`User response to install prompt: ${outcome}`);

    if (outcome === 'accepted') {
      setInstalled(true);
      setShowBanner(false);
    } else {
      // If user declined, dismiss the banner and treat it as a dismissal
      handleDismiss();
    }
    
    // Clear deferred prompt state
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    // Save dismissal timestamp in localStorage to block prompts for 7 days
    localStorage.setItem('pwa-install-dismissed', Date.now().toString());
    setShowBanner(false);
    console.log('PWA install prompt dismissed. Stored in localStorage.');
  };

  if (!showBanner || installed) return null;

  return (
    <div className="fixed bottom-6 left-4 right-4 md:left-auto md:right-6 md:w-96 z-[100] animate-bounce-in">
      <div className="bg-gray-900 border border-white/10 rounded-2xl p-5 shadow-2xl backdrop-blur-lg flex flex-col space-y-4">
        
        {/* Header Block */}
        <div className="flex items-start justify-between">
          <div className="flex space-x-3">
            <div className="h-10 w-10 rounded-xl bg-brand-primary/10 border border-brand-primary/20 flex items-center justify-center text-brand-primary shrink-0">
              {deviceType === 'ios' ? (
                <Share className="h-5 w-5" />
              ) : (
                <Smartphone className="h-5 w-5" />
              )}
            </div>
            <div className="space-y-0.5">
              <h4 className="text-sm font-bold text-white font-outfit">
                Install {tenant?.appName || 'App'}
              </h4>
              <p className="text-xs text-gray-400 leading-normal">
                {deviceType === 'ios' 
                  ? 'Add to your Home Screen for fast booking access.'
                  : 'Install on your device for a native, fast booking experience.'
                }
              </p>
            </div>
          </div>
          <button 
            onClick={handleDismiss}
            className="p-1 rounded-full text-gray-500 hover:text-white hover:bg-white/5 transition-colors"
            title="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Action Content / Instructions */}
        {deviceType === 'ios' ? (
          <div className="bg-white/5 rounded-xl p-3 border border-white/5 text-xs text-gray-300 space-y-2">
            <p className="font-semibold text-brand-primary flex items-center gap-1.5">
              <Share className="h-3.5 w-3.5" />
              Safari Instructions:
            </p>
            <ol className="list-decimal list-inside space-y-1 text-gray-400 pl-1">
              <li>Tap the <span className="text-white font-medium">Share</span> button at the bottom.</li>
              <li>Scroll down the list of options.</li>
              <li>Select <span className="text-white font-medium">Add to Home Screen</span>.</li>
            </ol>
          </div>
        ) : (
          <div className="flex items-center space-x-3 pt-1">
            <button
              onClick={handleInstallClick}
              className="flex-1 py-2.5 px-4 rounded-xl bg-brand-primary hover:opacity-95 text-white text-xs font-semibold flex items-center justify-center space-x-2 transition-all shadow-lg shadow-brand-primary/20"
            >
              <Download className="h-4 w-4" />
              <span>Install App</span>
            </button>
            <button
              onClick={handleDismiss}
              className="flex-1 py-2.5 px-4 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 border border-white/10 text-xs font-semibold transition-all"
            >
              Later
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
