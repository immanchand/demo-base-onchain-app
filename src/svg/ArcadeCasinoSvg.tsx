// components/ArcadeCasinoSvg.tsx
export default function ArcadeCasinoSvg() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="250"
      height="40"
      viewBox="0 0 250 40"
      fill="none"
    >
      <title>Arcade Casino SVG</title>
      <rect
        x="0"
        y="0"
        width="250"
        height="40"
        fill="#800080" // Purple background
        opacity="0.2"
        rx="5"
      />
      <text
        x="50%"
        y="50%"
        dominantBaseline="middle"
        textAnchor="middle"
        fontFamily="'Comic Sans MS', cursive"
        fontSize="28"
        fill="#FFD700" // Golden yellow text
        style={{ textShadow: '0 0 4px rgba(255, 215, 0, 0.5)' }} // Subtle glow
      >
        Arcade Casino
      </text>
    </svg>
  );
}
