import { useEffect } from 'react';
import { useFrameCallback, useSharedValue, type SharedValue } from 'react-native-reanimated';

// One frame is about 16ms. After a pause, the first frame can report a huge gap.
// Capping the step keeps loops from jumping ahead when they resume.
const MAX_STEP_MS = 64;

/**
 * A clock for endless background loops (the orb, the glow drift).
 * It counts milliseconds on the UI thread, and only while `running` is true,
 * so loops pause in the background and with Reduce Motion.
 * `speed` (optional) makes the clock run faster or slower without jumps: 2 = twice as fast.
 */
export function useLoopClock(running: boolean, speed?: SharedValue<number>) {
  const time = useSharedValue(0);

  const frame = useFrameCallback(({ timeSincePreviousFrame }) => {
    const step = Math.min(timeSincePreviousFrame ?? 0, MAX_STEP_MS);
    time.set(time.get() + step * (speed ? speed.get() : 1));
  }, false);

  useEffect(() => {
    frame.setActive(running);
    return () => frame.setActive(false);
  }, [frame, running]);

  return time;
}
