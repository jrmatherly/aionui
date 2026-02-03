import type React from 'react';
import { useCallback, useRef } from 'react';

/**
 * Throttle Hook
 * @param callback The function to throttle
 * @param delay Throttle delay time in milliseconds
 * @returns The throttled function
 */
function useThrottle<T extends (...args: any[]) => any>(callback: T, delay: number, deps: React.DependencyList): T {
  const lastExecTime = useRef<number>(0);
  const timeoutId = useRef<NodeJS.Timeout | null>(null);

  const throttledFunction = useCallback(
    (...args: Parameters<T>) => {
      const now = Date.now();
      const timeSinceLastExec = now - lastExecTime.current;

      // If enough time has passed since last execution, execute immediately
      if (timeSinceLastExec >= delay) {
        callback(...args);
        lastExecTime.current = now;
      } else {
        // Otherwise clear the previous timer and set a new one
        if (timeoutId.current) {
          clearTimeout(timeoutId.current);
        }

        timeoutId.current = setTimeout(() => {
          callback(...args);
          lastExecTime.current = Date.now();
          timeoutId.current = null;
        }, delay - timeSinceLastExec);
      }
    },
    [delay, ...deps]
  );

  return throttledFunction as T;
}

export default useThrottle;
