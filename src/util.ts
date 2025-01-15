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
export function randomArrayElement<T>(array: readonly T[]): T {
  return array[_.random(0, array.length - 1)];
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
  options: Partial<T> | undefined,
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
