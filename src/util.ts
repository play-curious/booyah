import * as _ from "underscore";

/** Test containment using _.isEqual() */
export function contains<T>(list: T[], p: T): boolean {
  for (const x of list) {
    if (_.isEqual(x, p)) return true;
  }
  return false;
}

/** Test containment using _.isEqual() */
export function indexOf<T>(list: T[], p: T): number {
  for (let i = 0; i < list.length; i++) {
    if (_.isEqual(list[i], p)) return i;
  }
  return -1;
}

/** Find unique elements using _.isEqual() */
export function uniq<T>(array: T[]): T[] {
  const results: T[] = [];
  const seen: T[] = [];
  array.forEach((value, index) => {
    if (!contains(seen, value)) {
      seen.push(value);
      results.push(array[index]);
    }
  });
  return results;
}

/** Returns a new array with the given element excluded, tested using _.isEqual() */
export function removeFromArray<T>(array: T[], value: T): T[] {
  const ret: T[] = [];
  for (const element of array)
    if (!_.isEqual(element, value)) ret.push(element);
  return ret;
}

/** Deep clone of JSON-serializable objects */
export function cloneData<T>(o: T): T {
  return JSON.parse(JSON.stringify(o));
}

/** Picks a random element from the array */
export function randomArrayElement<T>(array: T[]): T {
  return array[_.random(0, array.length - 1)];
}

export function lerpColor(
  start: number,
  end: number,
  fraction: number,
): number {
  const r = ((end & 0xff0000) >> 16) - ((start & 0xff0000) >> 16);
  const g = ((end & 0x00ff00) >> 8) - ((start & 0x00ff00) >> 8);
  const b = (end & 0x0000ff) - (start & 0x0000ff);
  return start + ((r * fraction) << 16) + ((g * fraction) << 8) + b;
}

export function cyclicLerpColor(
  start: number,
  end: number,
  fraction: number,
): number {
  return fraction < 0.5
    ? lerpColor(start, end, fraction / 0.5)
    : lerpColor(end, start, (fraction - 0.5) / 0.5);
}

export function toFixedFloor(x: number, decimalPlaces: number): number {
  const divider = Math.pow(10, decimalPlaces);
  return Number((Math.floor(x * divider) / divider).toFixed(decimalPlaces));
}

export function supportsFullscreen(): boolean {
  // Stop TypeScript from complaining about feature detection
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d: any = document;
  return !!(
    d.fullscreenEnabled ||
    d.mozFullScreenEnabled ||
    d.webkitFullscreenEnabled ||
    d.msFullscreenEnabled
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function requestFullscreen(element: any): void {
  if (element.requestFullscreen) {
    element.requestFullscreen();
  } else if (element.mozRequestFullScreen) {
    element.mozRequestFullScreen();
  } else if (element.webkitRequestFullscreen) {
    element.webkitRequestFullscreen();
  } else if (element.msRequestFullscreen) {
    element.msRequestFullscreen();
  }
}

export function exitFullscreen(): void {
  if (document.exitFullscreen) document.exitFullscreen().catch();
  //@ts-ignore
  else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
  //@ts-ignore
  else if (document.mozCancelFullScreen) document.mozCancelFullScreen();
  //@ts-ignore
  else if (document.msExitFullscreen) document.msExitFullscreen();
}

export function inFullscreen(): boolean {
  return !!(
    document.fullscreenElement ||
    //@ts-ignore
    document.webkitFullscreenElement ||
    //@ts-ignore
    document.mozFullScreenElement ||
    //@ts-ignore
    document.msFullScreenElement
  );
}

/* Makes a video element plays easily on iOS. Requires muting */
export function makeVideoElement(): HTMLVideoElement {
  const videoElement = document.createElement("video");
  videoElement.muted = true;
  videoElement.setAttribute("playsinline", "true");
  videoElement.setAttribute("preload", "auto");
  return videoElement;
}

/**
 * Fills in the mising options from the provided defaults
 * @param options Options provided by the caller
 * @param defaults Defaults provided by the author
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function fillInOptions<T extends Record<string, any>>(
  options: Partial<T>,
  defaults: T,
): T {
  if (options) return { ...defaults, ...options };
  else return defaults;
}

export function stringToBool(s?: string): boolean {
  if (isNullish(s)) return false;

  return !/^(?:false|off|0)$/i.test(s);
}

/**
 * Returns true if @list all of the values in @values.
 * Uses _.contains() internally
 */
export function containsAll<T>(list: _.List<T>, values: T[]) {
  for (const value of values) {
    if (!_.contains(list, value)) return false;
  }
  return true;
}

/** Like Underscore's defaults(), excepts merges embedded objects */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function deepDefaults(...args: any[]) {
  if (args.length === 0) return {};

  const result = args[0];
  for (let i = 1; i < args.length; i++) {
    const a = args[i];
    for (const key in a) {
      const value = a[key];
      if (_.isUndefined(value)) continue;

      if (!_.has(result, key)) {
        result[key] = value;
      } else if (_.isObject(result[key])) {
        deepDefaults(result[key], value);
      }
    }
  }
  return result;
}

export function uppercaseFirstLetter(name: string): string {
  return name[0].toUpperCase() + name.substring(1);
}

export function shortenString(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;

  return text.substr(0, maxLength - 3) + "...";
}

/**
 * Set properties recursively in a PIXI scene graph
 */
export interface Root {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
  children: Root[];
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function setPropertyInTree(root: Root, name: string, value: any): void {
  if (name in root) root[name] = value;

  for (const child of root.children) {
    setPropertyInTree(child, name, value);
  }
}

/**
 * Determines which language to show the game in.
 *
 * The function looks for langauge information from the following sources, from highest-to-lowest priority:
 * 1. The value of "lang" in the URL query string
 * 2. The value of the "lang" attribute in the HTML element (e.g. `<html lang="fr">`)
 *
 * If no valid language is found, will return the default language.
 */
export function determineLanguage(
  validLanguages = ["en"],
  defaultLanguage = "en",
): string {
  // Try URL
  {
    const params = new URLSearchParams(window.location.search);
    const requestedLang = params.get("lang");
    if (requestedLang && _.contains(validLanguages, requestedLang))
      return requestedLang;
  }

  // Try HTML element
  {
    const requestedLang = document.documentElement.lang;
    if (requestedLang && _.contains(validLanguages, requestedLang))
      return requestedLang;
  }

  // Use default
  return defaultLanguage;
}

export function reverseString(s: string): string {
  return s.split("").reverse().join("");
}

/**
 * Returns a copy of a part of an array, going forwards or backwards
 * @param a Array
 * @param startAt Index to start at
 * @param length Positive or negative
 */
export function subarray<T>(
  a: Array<T>,
  startAt: number,
  length: number,
): Array<T> {
  const result: Array<T> = [];
  if (length > 0) {
    for (let i = 0; i < length; i++) {
      result.push(a[startAt + i]);
    }
  } else {
    for (let i = 0; i < -length; i++) {
      result.push(a[startAt - i]);
    }
  }
  return result;
}

/** Returns true if x is null or undefined */
export function isNullish(x: unknown): boolean {
  return x == void 0;
}

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
export function areAlmostEqualNumber(x: number, y: number): boolean {
  return Math.abs(x - y) <= EPSILON;
}
