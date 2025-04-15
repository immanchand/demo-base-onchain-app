// src/components/Button.tsx
import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  className?: string;
  children: React.ReactNode;
}

const Button: React.FC<ButtonProps> = ({ className = '', children, ...props }) => (
  <button className={`btn-primary ${className}`} {...props}>
    {children}
  </button>
);

export default Button;
