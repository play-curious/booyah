// Geometry 

export const EPSILON = 0.001;
export const ZERO = new PIXI.Point(0, 0);
export const ONE = new PIXI.Point(1, 1);



export function clamp(x, min, max) {
  return Math.min(max, Math.max(min, x));
}

export function distance(a, b) {
  let x = a.x - b.x;
  let y = a.y - b.y;
  return Math.sqrt(x*x + y*y);
}

export function lerp(a, b, p) {
  return a + (b - a) * p;
}

export function lerpPoint(a, b, p) {
  const x = b.x - a.x;
  const y = b.y - a.y;
  return new PIXI.Point(a.x + p * x, a.y + p * y);
}

// Find the direction around the circle that is shorter
// Based on https://stackoverflow.com/a/2007279
export function angleBetweenAngles(source, target) {
  return Math.atan2(Math.sin(target - source), Math.cos(target - source));
}

export function lerpAngle(a, b, p) {
  return a + p * angleBetweenAngles(a, b); 
}

export function makeAnglePositive(a) {
  while(a < 0) a += 2*Math.PI;
  return a;
}

export function normalizeAngle(a) {
  while(a > Math.PI) a -= 2 * Math.PI;
  while(a < -Math.PI) a += 2 * Math.PI;
  return a;
}

export function radiansToDegrees(a) {
  return a * 180 / Math.PI;
}

export function degreesToRadians(a) {
  return a * Math.PI / 180;
}


export function add(...points) {
  const r = new PIXI.Point();
  for(const p of points) {
    r.x += p.x;
    r.y += p.y;
  } 
  return r;
}

export function subtract(...points) {
  const r = new PIXI.Point(points[0].x, points[0].y);
  for(let i = 1; i < points.length; i++) {
    r.x -= points[i].x;
    r.y -= points[i].y;
  } 
  return r;
}

export function multiply(a, p) {
  return new PIXI.Point(a.x * p, a.y * p);
}

export function divide(a, p) {
  return new PIXI.Point(a.x / p, a.y / p);
}

export function floor(p) {
  return new PIXI.Point(Math.floor(p.x), Math.floor(p.y));
}

export function round(p) {
  return new PIXI.Point(Math.round(p.x), Math.round(p.y));
}

export function min(...points) {
  const r = new PIXI.Point(Infinity, Infinity);
  for(p of points) {
    r.x = Math.min(p.x, r.x);
    r.y = Math.min(p.y, r.y);
  } 
  return r;
}

export function max(...points) {
  const r = new PIXI.Point(-Infinity, -Infinity);
  for(p of points) {
    r.x = Math.max(p.x, r.x);
    r.y = Math.max(p.y, r.y);
  } 
  return r;
}

export function inRectangle(p, min, max) {
  return p.x >= min.x && p.x <= max.x && p.y >= min.y && p.y <= max.y;
}

export function average(...points) {
  var sum = new PIXI.Point();
  for(let point of points) sum = add(sum, point);
  return divide(sum, points.length);
}

export function moveTowards(a, b, speed) {
  const d = distance(a, b);
  return lerpPoint(a, b, clamp(speed / d, 0, 1));
}

export function moveTowardsAngle(a, b, speed) {
  const diff = angleBetweenAngles(a, b);
  if(diff >= 0) {
    const targetDiff = Math.min(diff, speed);
    return a + targetDiff;
  } else {
    const targetDiff = Math.min(-diff, speed);
    return a - targetDiff;    
  }
}

export function randomInRange(a, b) {
  return a + Math.random() * (b - a);
}

export function randomPointInRange(min, max) {
  return new PIXI.Point(randomInRange(min.x, max.x), randomInRange(min.y, max.y));
}

// Returns true if point is within distance d of otherPoints
export function withinDistanceOfPoints(point, d, otherPoints) {
  for(const otherPoint of otherPoints) {
    if(distance(point, otherPoint) <= d) return true;
  }
  return false;
}

export function randomPointAwayFromOthers(min, max, distanceFromPoints, existingPoints) {
  while(true) {
    const newPoint = randomPointInRange(min, max);
    if(!withinDistanceOfPoints(newPoint, distanceFromPoints, existingPoints)) return newPoint;
  }
}