import type { ImagePreviewProps } from '../types';

export function ImagePreview({
  src,
  alt,
  badge,
  className = '',
  onClick
}: ImagePreviewProps) {
  const baseClasses = "relative aspect-square rounded-lg overflow-hidden border border-white/20 bg-white/5";
  const combinedClasses = onClick
    ? `${baseClasses} hover:scale-105 transition-all cursor-pointer ${className}`
    : `${baseClasses} ${className}`;

  return (
    <div className={combinedClasses} onClick={onClick}>
      <img
        src={src}
        alt={alt}
        className="w-full h-full object-cover"
      />
      {badge && (
        <div className="absolute top-2 right-2 bg-black/70 text-white text-xs px-2 py-1 rounded backdrop-blur-sm">
          {badge}
        </div>
      )}
    </div>
  );
}
