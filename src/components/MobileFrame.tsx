import React from 'react';
import { Wifi, Battery, Signal } from 'lucide-react';

interface MobileFrameProps {
  children: React.ReactNode;
  isMobileFrame: boolean;
}

export const MobileFrame: React.FC<MobileFrameProps> = ({ children, isMobileFrame }) => {
  if (!isMobileFrame) {
    return <div className="w-full h-full flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 font-sans">{children}</div>;
  }

  return (
    <div className="w-full h-full bg-slate-900 flex items-center justify-center p-2 sm:p-6 overflow-hidden font-sans">
      {/* Phone Shell */}
      <div
        className="relative w-full max-w-[430px] h-full max-h-[880px] bg-white dark:bg-slate-900 rounded-[48px] border-[8px] border-slate-800 shadow-2xl flex flex-col overflow-hidden ring-1 ring-slate-700/50"
        style={{ transform: 'translate3d(0, 0, 0)' }}
      >
        {/* Dynamic Island / Notch */}
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-40 w-28 h-5 bg-slate-950 rounded-full flex items-center justify-center border border-slate-800">
          <div className="w-2.5 h-2.5 rounded-full bg-slate-800" />
        </div>

        {/* Status Bar */}
        <div className="h-9 bg-white dark:bg-slate-900 text-[10px] text-slate-600 dark:text-slate-300 font-bold px-6 flex items-center justify-between shrink-0 z-30 pt-1 border-b border-slate-100 dark:border-slate-800 transition-colors">
          <span>09:41</span>
          <div className="flex items-center gap-1.5">
            <Signal className="w-3 h-3 text-slate-700 dark:text-slate-300" />
            <Wifi className="w-3 h-3 text-slate-700 dark:text-slate-300" />
            <Battery className="w-3.5 h-3.5 text-pink-500 fill-pink-500" />
          </div>
        </div>

        {/* Content Viewport */}
        <div className="relative flex-1 flex flex-col overflow-hidden bg-slate-50 dark:bg-slate-950">
          {children}
        </div>

        {/* Home Indicator Bar */}
        <div className="h-4 bg-white dark:bg-slate-900 flex items-center justify-center shrink-0 z-30 border-t border-slate-100 dark:border-slate-800 transition-colors">
          <div className="w-32 h-1 bg-slate-300 dark:bg-slate-700 rounded-full" />
        </div>
      </div>
    </div>
  );
};
