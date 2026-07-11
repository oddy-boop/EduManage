import React from 'react';

interface IconProps {
  name: string;
  className?: string;
  fill?: boolean;
}

export const Icon: React.FC<IconProps> = ({ name, className = '', fill = false }) => {
  return (
    <span 
      className={`material-symbols-outlined ${fill ? 'fill-1' : ''} ${className}`}
    >
      {name}
    </span>
  );
};
