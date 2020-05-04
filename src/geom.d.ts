export declare const EPSILON = 0.001;
export declare const ZERO: PIXI.Point;
export declare const ONE: PIXI.Point;
/** Returns a number for x that is between min and max */
export declare function clamp(x: number, min: number, max: number): number;
/** Returns the vector length of a a PIXI Point */
export declare function magnitude(a: PIXI.Point): number;
/** Returns a copy of the PIXI Point x that has a magnitude between min and max */
export declare function clampMagnitude(a: PIXI.Point, min: number, max: number): PIXI.Point;
/** Returns the distance between two PIXI Points */
export declare function distance(a: PIXI.Point, b: PIXI.Point): number;
/** Linear interpolation between numbers a and b, using the fraction p */
export declare function lerp(a: number, b: number, p: number): number;
/** Linear interpolation between points a and b, using the fraction p */
export declare function lerpPoint(a: PIXI.Point, b: PIXI.Point, p: number): PIXI.Point;
/** Linear interpolation between arrays a and b, using the fraction p */
export declare function lerpArray(a: number[], b: number[], p: number): number[];
/** Linear interpolation between RGB colors a and b, using the fraction p */
export declare function lerpColor(a: number, b: number, p: number): number;
/**
 Find the direction around the circle that is shorter
 Based on https://stackoverflow.com/a/2007279
 */
export declare function angleBetweenAngles(source: number, target: number): number;
/** Linear interpolation between angles a and b, using fraction p */
export declare function lerpAngle(a: number, b: number, p: number): number;
/** Returns a copy of a that is > 0 */
export declare function makeAnglePositive(a: number): number;
/** Normalizes an angle between -pi and pi */
export declare function normalizeAngle(a: number): number;
/** Converts radians to degrees */
export declare function radiansToDegrees(a: number): number;
/** Converts degrees to radians */
export declare function degreesToRadians(a: number): number;
/** Creates a vector pointing in the direction angle, with the length magnitude */
export declare function vectorFromAngle(angle: number, magnitude?: number): PIXI.Point;
/** Returns the sum of PIXI points */
export declare function add(...points: PIXI.Point[]): PIXI.Point;
/** Returns the difference of PIXI points */
export declare function subtract(...points: PIXI.Point[]): PIXI.Point;
/** Returns the multiplication of a PIXI point by a scalar */
export declare function multiply(a: PIXI.Point, p: number): PIXI.Point;
/** Returns the division of a PIXI point by a scalar */
export declare function divide(a: PIXI.Point, p: number): PIXI.Point;
/** Returns a PIXI point with each element rounded down */
export declare function floor(p: PIXI.Point): PIXI.Point;
/** Returns a PIXI point with each element rounded */
export declare function round(p: PIXI.Point): PIXI.Point;
/** Returns a PIXI point that has the minimum of each component */
export declare function min(...points: PIXI.Point[]): PIXI.Point;
/** Returns a PIXI point that has the maximum of each component */
export declare function max(...points: PIXI.Point[]): PIXI.Point;
/** Returns true if the point p is between points min and max */
export declare function inRectangle(p: PIXI.Point, min: PIXI.Point, max: PIXI.Point): boolean;
/** Takes the mean of PIXI points */
export declare function average(...points: PIXI.Point[]): PIXI.Point;
/**
 Returs a point along the line between a and b, moving at a given speed.
 Will not "overshoot" b.
 */
export declare function moveTowards(a: PIXI.Point, b: PIXI.Point, speed: number): PIXI.Point;
export declare const moveTowardsPoint: typeof moveTowards;
/**
 Returs an angle between a and b, turning at a given speed.
 Will not "overshoot" b.
 */
export declare function moveTowardsAngle(a: number, b: number, speed: number): number;
/**
 Returns a number along the line between a and b, moving at a given speed.
 Will not "overshoot" b.
 */
export declare function moveTowardsScalar(a: number, b: number, speed: number): number;
/** Returns a random number between a amd b */
export declare function randomInRange(a: number, b: number): number;
/** Returns a random point between a amd b, with each component considered separately */
export declare function randomPointInRange(min: PIXI.Point, max: PIXI.Point): PIXI.Point;
export declare function withinDistanceOfPoints(point: PIXI.Point, d: number, otherPoints: PIXI.Point[]): boolean;
/**
 Returns a point that is a given distance away from of otherPoints.
 Warning: Could loop for a while, maybe forever!
 */
export declare function randomPointAwayFromOthers(min: PIXI.Point, max: PIXI.Point, distanceFromPoints: number, existingPoints: PIXI.Point[]): PIXI.Point | null;
