// Icons drawn for Sovrns where the icon set has no match. They take the same `size` and
// `color` props as the Phosphor icons and use the same 1.5pt-at-24pt stroke.
import Svg, { Line, Path } from 'react-native-svg';

export type GlyphProps = {
  size?: number;
  color?: string;
};

/** Two lines: opens the chat history. */
export function MenuIcon({ size = 24, color = '#000' }: GlyphProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Line x1={4} y1={9} x2={20} y2={9} stroke={color} strokeWidth={1.6} strokeLinecap="round" />
      <Line x1={4} y1={15} x2={14} y2={15} stroke={color} strokeWidth={1.6} strokeLinecap="round" />
    </Svg>
  );
}

/** Five rounded bars of different heights: Speak (voice mode). */
export function VoiceBarsIcon({ size = 24, color = '#000' }: GlyphProps) {
  const bars = [
    [4, 10, 14],
    [8, 6.5, 17.5],
    [12, 3.5, 20.5],
    [16, 6.5, 17.5],
    [20, 10, 14],
  ];
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {bars.map(([x, y1, y2]) => (
        <Path
          key={x}
          d={`M${x} ${y1}V${y2}`}
          stroke={color}
          strokeWidth={2}
          strokeLinecap="round"
        />
      ))}
    </Svg>
  );
}
