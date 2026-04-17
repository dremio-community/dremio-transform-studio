import React from 'react';

interface IconStarStarredProps {
  size?: number;
  className?: string;
}

export function IconStarStarred({ size = 24, className }: IconStarStarredProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <path d="M11.0297 4.86505C11.4259 4.06158 12.5711 4.06158 12.9672 4.86505L14.8542 8.68794L19.074 9.30094C19.9599 9.42979 20.3137 10.519 19.6726 11.144L16.6188 14.121L17.3399 18.3224C17.4919 19.2051 16.5652 19.8781 15.7721 19.462L11.9981 17.4773L8.22479 19.462C7.43253 19.8781 6.50582 19.2059 6.65627 18.3224L7.37731 14.121L4.32428 11.144C3.68327 10.5198 4.03699 9.42979 4.92288 9.30094L9.1427 8.68794L11.0297 4.86505Z" fill="#FFA940"/>
    </svg>
  );
}
