import { ImageOff } from 'lucide-react';

interface CardThumbnailProps {
  imageUrl: string | null;
  name: string;
}

export default function CardThumbnail({ imageUrl, name }: CardThumbnailProps) {
  if (!imageUrl) {
    return (
      <div className="flex h-10 w-7 shrink-0 items-center justify-center rounded-md bg-slate-200">
        <ImageOff className="h-3.5 w-3.5 text-slate-400" />
      </div>
    );
  }
  return (
    <img
      src={imageUrl}
      alt={name}
      loading="lazy"
      className="h-10 w-7 shrink-0 rounded-md bg-slate-200 object-cover"
    />
  );
}
