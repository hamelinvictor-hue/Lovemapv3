import React from 'react';

interface StoreRatingModalProps {
  isOpen?: boolean;
  onClose?: () => void;
  onToast?: (msg: string) => void;
  triggerSource?: 'first_spot' | 'app_launch' | 'manual';
}

/**
 * StoreRatingModal has been replaced on iPhone by the native Apple system dialog (SKStoreReviewController via @capawesome/capacitor-app-review)
 * and completely removed on Web as requested.
 */
export const StoreRatingModal: React.FC<StoreRatingModalProps> = () => {
  return null;
};

