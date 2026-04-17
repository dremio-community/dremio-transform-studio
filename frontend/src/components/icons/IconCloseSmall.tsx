import React from 'react';

interface IconCloseSmallProps {
  size?: number;
  className?: string;
}

// Close/small — X vector is 12×12, sitting in a 24×24 frame with 6px padding on all sides
// (outer div size-[24px], inner div absolute inset-1/4 = 6px inset each side).
// Using a 24×24 viewBox with a translate(6,6) group preserves this proportion.
export function IconCloseSmall({ size = 24, className }: IconCloseSmallProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <g transform="translate(6, 6)">
        <path
          d="M10.7197 0.21967C11.0126 -0.0732233 11.4874 -0.0732233 11.7803 0.21967C12.0732 0.512563 12.0732 0.987437 11.7803 1.28033L7.06066 6L11.7803 10.7197C12.0732 11.0126 12.0732 11.4874 11.7803 11.7803C11.4874 12.0732 11.0126 12.0732 10.7197 11.7803L6 7.06066L1.28033 11.7803C0.987437 12.0732 0.512563 12.0732 0.219669 11.7803C-0.0732231 11.4874 -0.0732231 11.0126 0.219669 10.7197L4.93934 6L0.21967 1.28033C-0.0732233 0.987437 -0.0732233 0.512563 0.21967 0.21967C0.512563 -0.0732233 0.987437 -0.0732233 1.28033 0.21967L6 4.93934L10.7197 0.21967Z"
          fill="currentColor"
        />
      </g>
    </svg>
  );
}
