// Geometry

export const EPSILON = 0.001;

/** Returns a number for x that is between min and max */
export function clamp(x: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, x));
}

/** Linear interpolation between numbers a and b, using the fraction p */
export function lerp(a: number, b: number, p: number): number {
  return a + (b - a) * p;
}

/** Linear interpolation between arrays a and b, using the fraction p */
export function lerpArray(a: number[], b: number[], p: number) {
  const result = [];
  for (let i = 0; i < a.length; i++) {
    result.push(lerp(a[i], b[i], p));
  }
  return result;
}

/** Linear interpolation between RGB colors a and b, using the fraction p */
export function lerpColor(a: number, b: number, p: number): number {
  // Separate into 3 components
  const aComponents = [(a & 0xff0000) >> 16, (a & 0x00ff00) >> 8, a & 0x0000ff];
  const bComponents = [(b & 0xff0000) >> 16, (b & 0x00ff00) >> 8, b & 0x0000ff];

  return (
    (lerp(aComponents[0], bComponents[0], p) << 16) |
    (lerp(aComponents[1], bComponents[1], p) << 8) |
    lerp(aComponents[2], bComponents[2], p)
  );
}

/**
 Find the direction around the circle that is shorter
 Based on https://stackoverflow.com/a/2007279
 */
export function angleBetweenAngles(source: number, target: number): number {
  return Math.atan2(Math.sin(target - source), Math.cos(target - source));
}

/** Linear interpolation between angles a and b, using fraction p */
export function lerpAngle(a: number, b: number, p: number): number {
  return a + p * angleBetweenAngles(a, b);
}

/** Returns a copy of a that is > 0 */
export function makeAnglePositive(a: number): number {
  while (a < 0) a += 2 * Math.PI;
  return a;
}

/** Normalizes an angle between -pi and pi */
export function normalizeAngle(a: number): number {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

/** Converts radians to degrees */
export function radiansToDegrees(a: number): number {
  return (a * 180) / Math.PI;
}

/** Converts degrees to radians */
export function degreesToRadians(a: number): number {
  return (a * Math.PI) / 180;
}
/**
 Returs an angle between a and b, turning at a given speed.
 Will not "overshoot" b.
 */
export function moveTowardsAngle(a: number, b: number, speed: number): number {
  const diff = angleBetweenAngles(a, b);
  if (diff >= 0) {
    const targetDiff = Math.min(diff, speed);
    return a + targetDiff;
  } else {
    const targetDiff = Math.min(-diff, speed);
    return a - targetDiff;
  }
}

/**
 Returns a number along the line between a and b, moving at a given speed.
 Will not "overshoot" b.
 */
export function moveTowardsScalar(a: number, b: number, speed: number): number {
  const d = Math.abs(b - a);
  return lerp(a, b, clamp(speed / d, 0, 1));
}

/** Returns a random number between a and b */
export function randomInRange(a: number, b: number): number {
  return a + Math.random() * (b - a);
}

/** Returns if two numbers are within an epsilon of each other */
export function numbersAreAlmostEqual(x: number, y: number): boolean {
  return Math.abs(x - y) <= EPSILON;
}
