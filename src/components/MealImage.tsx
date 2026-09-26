import React, { useState } from "react";
import { Utensils, LucideIcon } from "lucide-react";

interface MealImageProps {
  src?: string | null;
  alt: string;
  className?: string;
  containerClassName?: string;
  fallbackIcon?: LucideIcon;
  fallbackIconClassName?: string;
}

export const MealImage: React.FC<MealImageProps> = ({
  src,
  alt,
  className = "w-12 h-12 rounded-2xl object-cover",
  containerClassName,
  fallbackIcon: FallbackIcon = Utensils,
  fallbackIconClassName = "w-5 h-5 text-zinc-400 dark:text-zinc-500",
}) => {
  const [hasError, setHasError] = useState(false);
  const isValidSrc = typeof src === "string" && src.trim().length > 0 && !hasError;

  if (isValidSrc) {
    return (
      <img
        src={src!}
        alt={alt || "وجبة"}
        className={className}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => setHasError(true)}
      />
    );
  }

  return (
    <div
      className={
        containerClassName ||
        "w-12 h-12 rounded-2xl bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-200/60 dark:border-zinc-700/50 flex items-center justify-center shrink-0"
      }
    >
      <FallbackIcon className={fallbackIconClassName} />
    </div>
  );
};
