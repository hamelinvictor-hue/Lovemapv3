import React, { useState } from 'react';
import { Lock, Heart, Shield, KeyRound } from 'lucide-react';
import { triggerHaptic } from '../lib/feedback';

interface PinLockModalProps {
  correctPin: string;
  isLocked: boolean;
  onUnlock: () => void;
}

export const PinLockModal: React.FC<PinLockModalProps> = ({ correctPin, isLocked, onUnlock }) => {
  const [enteredPin, setEnteredPin] = useState('');
  const [error, setError] = useState(false);

  if (!isLocked) return null;

  const handleDigit = (digit: string) => {
    if (enteredPin.length < 4) {
      triggerHaptic('light');
      const updated = enteredPin + digit;
      setEnteredPin(updated);

      if (updated.length === 4) {
        if (updated === correctPin || updated === '1234') {
          triggerHaptic('success');
          setError(false);
          onUnlock();
        } else {
          triggerHaptic('error');
          setError(true);
          setTimeout(() => {
            setEnteredPin('');
            setError(false);
          }, 800);
        }
      }
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/90 dark:bg-slate-950/95 backdrop-blur-xl animate-fade-in font-sans">
      <div className="w-full max-w-xs text-center space-y-6 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-6 rounded-3xl shadow-2xl">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-pink-500 to-rose-500 flex items-center justify-center text-white mx-auto shadow-lg shadow-rose-500/20">
          <Heart className="w-7 h-7 fill-current" />
        </div>

        <div>
          <h2 className="text-lg font-black text-slate-900 dark:text-white tracking-tight">LoveMap Sécurisé</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5">Entrez votre code PIN à 4 chiffres</p>
          <p className="text-[10px] text-rose-500 dark:text-rose-400 font-bold font-mono mt-0.5">(PIN démo par défaut: 1234)</p>
        </div>

        {/* PIN Indicators */}
        <div className="flex justify-center gap-3">
          {[0, 1, 2, 3].map((idx) => (
            <div
              key={idx}
              className={`w-3.5 h-3.5 rounded-full border-2 transition-all ${
                enteredPin.length > idx
                  ? error
                    ? 'bg-rose-500 border-rose-500 scale-110'
                    : 'bg-rose-500 border-rose-500 scale-110 shadow-md shadow-rose-500/30'
                  : 'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700'
              }`}
            />
          ))}
        </div>

        {/* Keypad */}
        <div className="grid grid-cols-3 gap-2.5 pt-1 max-w-[220px] mx-auto">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'].map((item) => (
            <button
              key={item}
              onClick={() => {
                if (item === 'C') {
                  triggerHaptic('selection');
                  setEnteredPin('');
                } else if (item === '⌫') {
                  triggerHaptic('selection');
                  setEnteredPin((prev) => prev.slice(0, -1));
                } else {
                  handleDigit(item);
                }
              }}
              className="w-13 h-13 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-rose-50 dark:hover:bg-slate-700 text-slate-900 dark:text-white font-black text-base flex items-center justify-center shadow-xs active:scale-95 transition-transform mx-auto cursor-pointer"
            >
              {item}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
