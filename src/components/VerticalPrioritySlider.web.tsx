import { createElement } from 'react';
import type { VerticalPrioritySliderProps } from './VerticalPrioritySlider';
import { theme } from './ui';

// A real vertical range input keeps touch, mouse, keyboard and screen-reader behavior aligned.
export default function VerticalPrioritySlider({ label, value, color, disabled, onChange }: VerticalPrioritySliderProps) {
  return <>
    {createElement('style', {}, `
      .claro-priority-slider { appearance:none; -webkit-appearance:none; writing-mode:vertical-lr; direction:rtl; width:44px; height:164px; margin:0; background:transparent; cursor:ns-resize; touch-action:none; }
      .claro-priority-slider::-webkit-slider-runnable-track { width:8px; border-radius:8px; background:linear-gradient(to top,var(--factor-color) 0%,var(--factor-color) var(--factor-share),${theme.soft} var(--factor-share),${theme.soft} 100%); }
      .claro-priority-slider::-webkit-slider-thumb { appearance:none; -webkit-appearance:none; width:26px; height:26px; margin-left:-9px; border:3px solid white; border-radius:50%; background:${theme.teal}; box-shadow:0 1px 4px #0002; }
      .claro-priority-slider::-moz-range-track { width:8px; border-radius:8px; background:${theme.soft}; }
      .claro-priority-slider::-moz-range-progress { width:8px; background:var(--factor-color); }
      .claro-priority-slider::-moz-range-thumb { width:20px; height:20px; border:3px solid white; border-radius:50%; background:${theme.teal}; }
      .claro-priority-slider:focus-visible { outline:2px solid ${theme.teal}; outline-offset:2px; border-radius:8px; }
      .claro-priority-slider:disabled { opacity:.5; cursor:default; }
    `)}
    {createElement('input', { type: 'range', className: 'claro-priority-slider', min: 0, max: 100, step: 1,
      value, disabled, 'aria-label': label, 'aria-orientation': 'vertical', 'aria-valuetext': `${value} points`,
      style: { '--factor-color': color, '--factor-share': `${value}%` } as React.CSSProperties,
      onChange: (event: React.ChangeEvent<HTMLInputElement>) => onChange(Number(event.target.value)),
    })}
  </>;
}
