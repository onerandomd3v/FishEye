import type { ImgHTMLAttributes } from 'react';
import fishEyeLogo from '../../../assets/fisheye-logo.svg';

type BrandLogoProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
  compact?: boolean;
};

export function BrandLogo({
  compact = false,
  alt = 'FishEye',
  ...props
}: BrandLogoProps) {
  return (
    <img
      src={fishEyeLogo}
      alt={alt}
      width={compact ? 150 : 205}
      height={compact ? 44 : 60}
      {...props}
    />
  );
}
