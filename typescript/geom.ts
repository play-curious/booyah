// Geometry

export const EPSILON = 0.001;
export const ZERO = new PIXI.Point(0, 0);
export const ONE = new PIXI.Point(1, 1);

/** Returns a number for x that is between min and max */
export function clamp(x:number, min:number, max:number):number {
  return Math.min(max, Math.max(min, x));
}

/** Returns the vector length of a a PIXI Point */
export function magnitude(a:PIXI.Point): number {
  return Math.sqrt(a.x * a.x + a.y * a.y);
}

/** Returns a copy of the PIXI Point x that has a magnitude between min and max */
export function clampMagnitude(a:PIXI.Point, min:number, max:number):PIXI.Point {
  const mag = magnitude(a);
  if (mag < min) {
    return multiply(a, min / mag);
  } else if (mag > max) {
    return multiply(a, max / mag);
  } else {
    return a;
  }
}

/** Returns the distance between two PIXI Points */
export function distance(a:PIXI.Point, b:PIXI.Point):number {
  let x = a.x - b.x;
  let y = a.y - b.y;
  return Math.sqrt(x * x + y * y);
}

/** Linear interpolation between numbers a and b, using the fraction p */
export function lerp(a:number, b:number, p:number):number {
  return a + (b - a) * p;
}

/** Linear interpolation between points a and b, using the fraction p */
export function lerpPoint(a:PIXI.Point, b:PIXI.Point, p:number):PIXI.Point {
  const x = b.x - a.x;
  const y = b.y - a.y;
  return new PIXI.Point(a.x + p * x, a.y + p * y);
}

/** Linear interpolation between arrays a and b, using the fraction p */
export function lerpArray(a:number[], b:number[], p:number) {
  const result = [];
  for (let i = 0; i < a.length; i++) {
    result.push(lerp(a[i], b[i], p));
  }
  return result;
}

/** Linear interpolation between RGB colors a and b, using the fraction p */
export function lerpColor(a:number, b:number, p:number): number {
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
export function angleBetweenAngles(source:number, target:number):number {
  return Math.atan2(Math.sin(target - source), Math.cos(target - source));
}

/** Linear interpolation between angles a and b, using fraction p */
export function lerpAngle(a:number, b:number, p:number):number {
  return a + p * angleBetweenAngles(a, b);
}

/** Returns a copy of a that is > 0 */
export function makeAnglePositive(a:number):number {
  while (a < 0) a += 2 * Math.PI;
  return a;
}

/** Normalizes an angle between -pi and pi */
export function normalizeAngle(a:number):number {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

/** Converts radians to degrees */
export function radiansToDegrees(a:number):number {
  return (a * 180) / Math.PI;
}

/** Converts degrees to radians */
export function degreesToRadians(a:number):number {
  return (a * Math.PI) / 180;
}

/** Creates a vector pointing in the direction angle, with the length magnitude */
export function vectorFromAngle(angle:number, magnitude = 1):PIXI.Point {
  return new PIXI.Point(
      Math.cos(angle) * magnitude,
      Math.sin(angle) * magnitude
  );
}

/** Returns the sum of PIXI points */
export function add(...points:PIXI.Point[]):PIXI.Point {
  const r = new PIXI.Point();
  for (const p of points) {
    r.x += p.x;
    r.y += p.y;
  }
  return r;
}

/** Returns the difference of PIXI points */
export function subtract(...points:PIXI.Point[]):PIXI.Point {
  const r = new PIXI.Point(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    r.x -= points[i].x;
    r.y -= points[i].y;
  }
  return r;
}

/** Returns the multiplication of a PIXI point by a scalar */
export function multiply(a:PIXI.Point, p:number):PIXI.Point {
  return new PIXI.Point(a.x * p, a.y * p);
}

/** Returns the division of a PIXI point by a scalar */
export function divide(a:PIXI.Point, p:number):PIXI.Point {
  return new PIXI.Point(a.x / p, a.y / p);
}

/** Returns a PIXI point with each element rounded down */
export function floor(p:PIXI.Point):PIXI.Point {
  return new PIXI.Point(Math.floor(p.x), Math.floor(p.y));
}

/** Returns a PIXI point with each element rounded */
export function round(p:PIXI.Point):PIXI.Point {
  return new PIXI.Point(Math.round(p.x), Math.round(p.y));
}

/** Returns a PIXI point that has the minimum of each component */
export function min(...points:PIXI.Point[]):PIXI.Point {
  const r = new PIXI.Point(Infinity, Infinity);
  for (const p of points) {
    r.x = Math.min(p.x, r.x);
    r.y = Math.min(p.y, r.y);
  }
  return r;
}

/** Returns a PIXI point that has the maximum of each component */
export function max(...points:PIXI.Point[]):PIXI.Point {
  const r = new PIXI.Point(-Infinity, -Infinity);
  for (const p of points) {
    r.x = Math.max(p.x, r.x);
    r.y = Math.max(p.y, r.y);
  }
  return r;
}

/** Returns true if the point p is between points min and max */
export function inRectangle(p:PIXI.Point, min:PIXI.Point, max:PIXI.Point) {
  return p.x >= min.x && p.x <= max.x && p.y >= min.y && p.y <= max.y;
}

/** Takes the mean of PIXI points */
export function average(...points:PIXI.Point[]):PIXI.Point {
  let sum = new PIXI.Point();
  for (let point of points) sum = add(sum, point);
  return divide(sum, points.length);
}

/**
 Returs a point along the line between a and b, moving at a given speed.
 Will not "overshoot" b.
 */
export function moveTowards(a:PIXI.Point, b:PIXI.Point, speed:number):PIXI.Point {
  const d = distance(a, b);
  return lerpPoint(a, b, clamp(speed / d, 0, 1));
}

export const moveTowardsPoint = moveTowards;

/**
 Returs an angle between a and b, turning at a given speed.
 Will not "overshoot" b.
 */
export function moveTowardsAngle(a:number, b:number, speed:number):number {
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
export function moveTowardsScalar(a:number, b:number, speed:number):number {
  const d = Math.abs(b - a);
  return lerp(a, b, clamp(speed / d, 0, 1));
}

/** Returns a random number between a amd b */
export function randomInRange(a:number, b:number):number {
  return a + Math.random() * (b - a);
}

/** Returns a random point between a amd b, with each component considered separately */
export function randomPointInRange(min:PIXI.Point, max:PIXI.Point):PIXI.Point {
  return new PIXI.Point(
      randomInRange(min.x, max.x),
      randomInRange(min.y, max.y)
  );
}

/* Returns true if point is within distance d of otherPoints */
export function withinDistanceOfPoints(point:PIXI.Point, d:number, otherPoints:PIXI.Point[]): boolean {
  for (const otherPoint of otherPoints) {
    if (distance(point, otherPoint) <= d) return true;
  }
  return false;
}

/**
 Returns a point that is a given distance away from of otherPoints.
 Warning: Could loop for a while, maybe forever!
 */
export function randomPointAwayFromOthers(
    min:PIXI.Point,
    max:PIXI.Point,
    distanceFromPoints:number,
    existingPoints:PIXI.Point[]
):PIXI.Point | null {
  while (true) {
    const newPoint = randomPointInRange(min, max);
    if (!withinDistanceOfPoints(newPoint, distanceFromPoints, existingPoints))
      return newPoint;
  }
}
