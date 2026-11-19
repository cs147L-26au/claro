import Slider from '@react-native-community/slider';
import { View } from 'react-native';
import { theme } from './ui';

export type VerticalPrioritySliderProps = {
  label: string; value: number; color: string; disabled?: boolean; onChange: (value: number) => void;
};

export default function VerticalPrioritySlider({ label, value, color, disabled, onChange }: VerticalPrioritySliderProps) {
  return <View style={{ width: 44, height: 164, alignItems: 'center', justifyContent: 'center' }}>
    <Slider accessibilityLabel={label} accessibilityValue={{ min: 0, max: 100, now: value, text: `${value} points` }}
      minimumValue={0} maximumValue={100} step={1} value={value} onValueChange={onChange}
      minimumTrackTintColor={color} maximumTrackTintColor={theme.soft} thumbTintColor={theme.teal}
      disabled={disabled} tapToSeek style={{ width: 164, height: 44, transform: [{ rotate: '-90deg' }] }} />
  </View>;
}
