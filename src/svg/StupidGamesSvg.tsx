export default function StupidGamesSvg() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="250"
      height="40"
      viewBox="0 0 250 40"
      fill="none"
    >
      <title>Stupid Games SVG</title>
      <rect
        x="0"
        y="0"
        width="250"
        height="40"
        fill="#000000" // Black background
        opacity="0.3"
        rx="5"
      />
      <text
        x="50%"
        y="50%"
        dominantBaseline="middle"
        textAnchor="middle"
        fontFamily="'Courier New', Courier, monospace"
        fontSize="28"
        fill="#FFFF00" // Yellow text
        style={{ textShadow: '0 0 4px rgba(255, 255, 0, 0.5)' }} // Yellow glow
      >
        STUPID GAMES
      </text>
    </svg>
  );
}