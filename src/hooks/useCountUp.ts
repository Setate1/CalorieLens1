import { useEffect, useState } from "react";

export function useCountUp(
  targetValue: number,
  durationMs: number = 800,
  decimals: number = 0
): number {
  const [currentValue, setCurrentValue] = useState(0);

  useEffect(() => {
    // If user prefers reduced motion, set directly
    if (
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setCurrentValue(targetValue);
      return;
    }

    if (targetValue === 0) {
      setCurrentValue(0);
      return;
    }

    let startTime: number | null = null;
    let animationFrameId: number;

    const startValue = 0;

    const animate = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const elapsed = timestamp - startTime;
      const progress = Math.min(elapsed / durationMs, 1);

      // Ease-out cubic formula for natural deceleration
      const easeOut = 1 - Math.pow(1 - progress, 3);
      const nextValue = startValue + (targetValue - startValue) * easeOut;

      if (decimals === 0) {
        setCurrentValue(Math.round(nextValue));
      } else {
        const factor = Math.pow(10, decimals);
        setCurrentValue(Math.round(nextValue * factor) / factor);
      }

      if (progress < 1) {
        animationFrameId = requestAnimationFrame(animate);
      } else {
        setCurrentValue(targetValue);
      }
    };

    animationFrameId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [targetValue, durationMs, decimals]);

  return currentValue;
}
