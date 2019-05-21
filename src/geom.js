// Geometry

export const EPSILON = 0.001;
export const ZERO = new PIXI.Point(0, 0);
export const ONE = new PIXI.Point(1, 1);

/** Returns a number for x that is between min and max */
export function clamp(x, min, max) {
  return Math.min(max, Math.max(min, x));
}

/** Returns the vector length of a a PIXI Point */
export function magnitude(a) {
  return Math.sqrt(a.x * a.x + a.y * a.y);
}

/** Returns a copy of the PIXI Point x that has a magnitude between min and max */
export function clampMagnitude(a, min, max) {
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
export function distance(a, b) {
  let x = a.x - b.x;
  let y = a.y - b.y;
  return Math.sqrt(x * x + y * y);
}

/** Linear interpolation between numbers a and b, using the fraction p */
export function lerp(a, b, p) {
  return a + (b - a) * p;
}

/** Linear interpolation between points a and b, using the fraction p */
export function lerpPoint(a, b, p) {
  const x = b.x - a.x;
  const y = b.y - a.y;
  return new PIXI.Point(a.x + p * x, a.y + p * y);
}

/** Linear interpolation between RGB colors a and b, using the fraction p */
export function lerpColor(a, b, p) {
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
export function angleBetweenAngles(source, target) {
  return Math.atan2(Math.sin(target - source), Math.cos(target - source));
}

/** Linear interpolation between angles a and b, using fraction p */
export function lerpAngle(a, b, p) {
  return a + p * angleBetweenAngles(a, b);
}

/** Returns a copy of a that is > 0 */
export function makeAnglePositive(a) {
  while (a < 0) a += 2 * Math.PI;
  return a;
}

/** Normalizes an angle between -pi and pi */
export function normalizeAngle(a) {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

/** Converts radians to degrees */
export function radiansToDegrees(a) {
  return (a * 180) / Math.PI;
}

/** Converts degrees to radians */
export function degreesToRadians(a) {
  return (a * Math.PI) / 180;
}

/** Creates a vector pointing in the direction angle, with the length magnitude */
export function vectorFromAngle(angle, magnitude) {
  return new PIXI.Point(
    Math.cos(angle) * magnitude,
    Math.sin(angle) * magnitude
  );
}

/** Returns the sum of PIXI points */
export function add(...points) {
  const r = new PIXI.Point();
  for (const p of points) {
    r.x += p.x;
    r.y += p.y;
  }
  return r;
}

/** Returns the difference of PIXI points */
export function subtract(...points) {
  const r = new PIXI.Point(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    r.x -= points[i].x;
    r.y -= points[i].y;
  }
  return r;
}

/** Returns the multiplication of a PIXI point by a scalar */
export function multiply(a, p) {
  return new PIXI.Point(a.x * p, a.y * p);
}

/** Returns the division of a PIXI point by a scalar */
export function divide(a, p) {
  return new PIXI.Point(a.x / p, a.y / p);
}

/** Returns a PIXI point with each element rounded down */
export function floor(p) {
  return new PIXI.Point(Math.floor(p.x), Math.floor(p.y));
}

/** Returns a PIXI point with each element rounded */
export function round(p) {
  return new PIXI.Point(Math.round(p.x), Math.round(p.y));
}

/** Returns a PIXI point that has the minimum of each component */
export function min(...points) {
  const r = new PIXI.Point(Infinity, Infinity);
  for (const p of points) {
    r.x = Math.min(p.x, r.x);
    r.y = Math.min(p.y, r.y);
  }
  return r;
}

/** Returns a PIXI point that has the maximum of each component */
export function max(...points) {
  const r = new PIXI.Point(-Infinity, -Infinity);
  for (const p of points) {
    r.x = Math.max(p.x, r.x);
    r.y = Math.max(p.y, r.y);
  }
  return r;
}

/** Returns true if the point p is between points min and max */
export function inRectangle(p, min, max) {
  return p.x >= min.x && p.x <= max.x && p.y >= min.y && p.y <= max.y;
}

/** Takes the mean of PIXI points */
export function average(...points) {
  var sum = new PIXI.Point();
  for (let point of points) sum = add(sum, point);
  return divide(sum, points.length);
}

/** 
  Returs a point along the line between a and b, moving at a given speed. 
  Will not "overshoot" b.
*/
export function moveTowards(a, b, speed) {
  const d = distance(a, b);
  return lerpPoint(a, b, clamp(speed / d, 0, 1));
}

/** 
  Returs an angle between a and b, turning at a given speed. 
  Will not "overshoot" b.
*/
export function moveTowardsAngle(a, b, speed) {
  const diff = angleBetweenAngles(a, b);
  if (diff >= 0) {
    const targetDiff = Math.min(diff, speed);
    return a + targetDiff;
  } else {
    const targetDiff = Math.min(-diff, speed);
    return a - targetDiff;
  }
}

/** Returns a random number between a amd b */
export function randomInRange(a, b) {
  return a + Math.random() * (b - a);
}

/** Returns a random point between a amd b, with each component considered separately */
export function randomPointInRange(min, max) {
  return new PIXI.Point(
    randomInRange(min.x, max.x),
    randomInRange(min.y, max.y)
  );
}

/* Returns true if point is within distance d of otherPoints */
export function withinDistanceOfPoints(point, d, otherPoints) {
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
  min,
  max,
  distanceFromPoints,
  existingPoints
) {
  while (true) {
    const newPoint = randomPointInRange(min, max);
    if (!withinDistanceOfPoints(newPoint, distanceFromPoints, existingPoints))
      return newPoint;
  }
}
