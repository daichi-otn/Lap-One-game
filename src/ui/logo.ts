// ロゴ: 斜めの「LAP」(金) と「ONE」(青白)、チェッカーの帯、スピード線
export const LOGO_SVG = `
<svg viewBox="0 0 640 240" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="LAP ONE">
  <defs>
    <linearGradient id="logo-gold" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffe082"/>
      <stop offset="0.55" stop-color="#ffb300"/>
      <stop offset="1" stop-color="#ff6f00"/>
    </linearGradient>
    <linearGradient id="logo-blue" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset="0.6" stop-color="#9ee7ff"/>
      <stop offset="1" stop-color="#3b82f6"/>
    </linearGradient>
    <pattern id="logo-checker" width="28" height="28" patternUnits="userSpaceOnUse">
      <rect width="28" height="28" fill="#111"/>
      <rect width="14" height="14" fill="#f5f5f5"/>
      <rect x="14" y="14" width="14" height="14" fill="#f5f5f5"/>
    </pattern>
  </defs>
  <g opacity="0.45" stroke-linecap="round">
    <line x1="10" y1="60" x2="70" y2="40" stroke="#ffb300" stroke-width="3"/>
    <line x1="0" y1="95" x2="90" y2="70" stroke="#ffb300" stroke-width="2"/>
    <line x1="560" y1="30" x2="630" y2="55" stroke="#67e8f9" stroke-width="3"/>
    <line x1="580" y1="70" x2="640" y2="88" stroke="#67e8f9" stroke-width="2"/>
  </g>
  <g transform="skewX(-10)">
    <text x="60" y="150" font-family="Arial Black, Impact, sans-serif" font-size="120" font-style="italic" font-weight="900" fill="url(#logo-gold)" stroke="#3b2600" stroke-width="5" paint-order="stroke">LAP</text>
    <text x="345" y="150" font-family="Arial Black, Impact, sans-serif" font-size="120" font-style="italic" font-weight="900" fill="url(#logo-blue)" stroke="#0b2a4a" stroke-width="5" paint-order="stroke">ONE</text>
    <rect x="58" y="172" width="520" height="24" fill="url(#logo-checker)" stroke="#ffb300" stroke-width="3"/>
  </g>
</svg>`;
