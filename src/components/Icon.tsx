import React from 'react';
import * as LucideIcons from 'lucide-react';

interface IconProps {
  name: string;
  className?: string;
  size?: number;
}

export const Icon: React.FC<IconProps> = ({ name, className = 'w-5 h-5', size }) => {
  // Safe dynamic lucide icon rendering
  const icons = LucideIcons as unknown as Record<string, React.ElementType>;
  const IconComponent = icons[name] || LucideIcons.MapPin;
  return <IconComponent className={className} size={size} />;
};
