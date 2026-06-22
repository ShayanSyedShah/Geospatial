// Lighthouse brand mark — white tower, gold light + beam, one red band.
// Self-coloured so it reads on the dark/blue brand badges.
export default function LighthouseLogo({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M14 6.4 L22.5 3 L22.5 9.8 Z" fill="#ffd233" opacity="0.92" />
      <path d="M9.6 6 L12 2.8 L14.4 6 Z" fill="#ffffff" />
      <rect x="9.8" y="5.8" width="4.4" height="3.4" rx="0.7" fill="#ffd233" />
      <path d="M9.7 9.2 L14.3 9.2 L15.7 20 L8.3 20 Z" fill="#ffffff" />
      <path d="M9.4 12.6 L14.6 12.6 L15 15.4 L9 15.4 Z" fill="#e0463b" />
      <rect x="7.3" y="19.6" width="9.4" height="2.3" rx="0.7" fill="#ffffff" />
    </svg>
  );
}
