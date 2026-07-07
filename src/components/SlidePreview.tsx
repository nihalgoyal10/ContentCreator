import type { CSSProperties } from 'react';
import type { Slide, SlideRatio } from '../types';
import {
  RATIOS, DEFAULT_RATIO, textStyleOf, cqw, LINE_HEIGHT, SIDE_PAD_PCT,
  BOX_PAD_X, BOX_PAD_Y, BOX_RADIUS, boxFill,
} from '../lib/slideStyle';
import { fontFamily } from '../lib/fonts';

interface SlidePreviewProps {
  slide: Slide;
  ratio?: SlideRatio;
  className?: string;
  showText?: boolean;
}

export function SlidePreview({ slide, ratio = DEFAULT_RATIO, className = '', showText = true }: SlidePreviewProps) {
  // Generated slides have no source image — render the same gradient the canvas
  // renderer uses, so the preview matches the exported PNG.
  const background = slide.imageUrl
    ? undefined
    : `linear-gradient(135deg, ${slide.bgFrom || '#0f172a'}, ${slide.bgTo || '#1e293b'})`;

  const style = textStyleOf(slide);
  const fill = boxFill(style);

  // containerType: 'size' makes the caption's cqw units resolve to a percent of
  // THIS slide's width, so the text scales identically to the baked PNG.
  const containerStyle: CSSProperties = {
    aspectRatio: RATIOS[ratio].css,
    containerType: 'size',
    ...(background ? { background } : {}),
  };

  const textStyle: CSSProperties = {
    fontFamily: `"${fontFamily(style.font)}", sans-serif`,
    fontWeight: style.weight,
    fontSize: cqw(style.sizePx),
    color: style.color,
    lineHeight: LINE_HEIGHT,
    textAlign: 'center',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    maxWidth: '100%',
    ...(style.strokePx > 0
      ? { WebkitTextStroke: `${cqw(style.strokePx)} ${style.strokeColor}`, paintOrder: 'stroke fill' }
      : {}),
    ...(fill
      ? { background: fill, padding: `${BOX_PAD_Y}em ${BOX_PAD_X}em`, borderRadius: `${BOX_RADIUS}em` }
      : {}),
  };

  return (
    <div
      className={`relative rounded-md overflow-hidden bg-raised ${className}`}
      style={containerStyle}
    >
      {slide.imageUrl && (
        <>
          <img
            src={slide.imageUrl}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
          />
          {/* Match the canvas bake's darkening (rgba(0,0,0,0.45)) for readability. */}
          <div className="absolute inset-0 bg-black/45" />
        </>
      )}
      {showText && (
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ paddingLeft: `${SIDE_PAD_PCT}%`, paddingRight: `${SIDE_PAD_PCT}%` }}
        >
          <span style={textStyle}>{slide.text}</span>
        </div>
      )}
    </div>
  );
}
