import * as PIXI from "pixi.js";

import * as geom from "./geom";
import * as entity from "./entity";
import * as narration from "./narration";
import * as _ from "underscore";

/** Test containment using _.isEqual() */
export function contains<T = any>(list: T[], p: T): boolean {
  for (let x of list) {
    if (_.isEqual(x, p)) return true;
  }
  return false;
}

/** Test containment using _.isEqual() */
export function indexOf<T = any>(list: T[], p: T): number {
  for (let i = 0; i < list.length; i++) {
    if (_.isEqual(list[i], p)) return i;
  }
  return -1;
}

/** Find unique elements using _.isEqual() */
export function uniq<T = any>(array: T[]): T[] {
  let results: T[] = [];
  let seen: T[] = [];
  array.forEach((value, index) => {
    if (!contains(seen, value)) {
      seen.push(value);
      results.push(array[index]);
    }
  });
  return results;
}

/** Like _.difference(), but uses contains() */
export function difference<T = any>(array: T[]): T[] {
  const rest = Array.prototype.concat.apply(
    Array.prototype,
    Array.prototype.slice.call(arguments, 1)
  );
  return _.filter(array, (value) => !contains(rest, value));
}

/** Returns a new array with the given element excluded, tested using _.isEqual() */
export function removeFromArray<T = any>(array: T[], value: T): T[] {
  let ret: T[] = [];
  for (let element of array) if (!_.isEqual(element, value)) ret.push(element);
  return ret;
}

/** Deep clone of JSON-serializable objects */
export function cloneData<T = any>(o: T): T {
  return JSON.parse(JSON.stringify(o));
}

/** Picks a random element from the array */
export function randomArrayElement<T = any>(array: T[]): T {
  return array[_.random(0, array.length - 1)];
}

export function lerpColor(
  start: number,
  end: number,
  fraction: number
): number {
  const r = ((end & 0xff0000) >> 16) - ((start & 0xff0000) >> 16);
  const g = ((end & 0x00ff00) >> 8) - ((start & 0x00ff00) >> 8);
  const b = (end & 0x0000ff) - (start & 0x0000ff);
  return start + ((r * fraction) << 16) + ((g * fraction) << 8) + b;
}

export function cyclicLerpColor(
  start: number,
  end: number,
  fraction: number
): number {
  return fraction < 0.5
    ? lerpColor(start, end, fraction / 0.5)
    : lerpColor(end, start, (fraction - 0.5) / 0.5);
}

export function toFixedFloor(x: number, decimalPlaces: number): number {
  const divider = Math.pow(10, decimalPlaces);
  return Number((Math.floor(x * divider) / divider).toFixed(decimalPlaces));
}

export function resizeGame(appSize: PIXI.Point): void {
  const parentSize = new PIXI.Point(window.innerWidth, window.innerHeight);
  const scale = toFixedFloor(
    Math.min(parentSize.x / appSize.x, parentSize.y / appSize.y),
    2
  );

  const newSize = geom.multiply(appSize, scale);
  const remainingSpace = geom.subtract(parentSize, newSize);

  console.log("setting scale to", scale);

  const parent = document.getElementById("game-parent");
  parent.style.height = `${newSize.y}px`;

  const container = document.getElementById("game-container");
  const transformCss = `translate(${(remainingSpace.x / 2).toFixed(
    2
  )}px, 0px) scale(${scale})`;
  for (const prop of ["transform", "webkitTransform", "msTransform"]) {
    // @ts-ignore
    container.style[prop] = transformCss;
  }
}

export function supportsFullscreen(): boolean {
  // Stop TypeScript from complaining about feature detection
  const d: any = document;
  return !!(
    d.fullscreenEnabled ||
    d.mozFullScreenEnabled ||
    d.webkitFullscreenEnabled ||
    d.msFullscreenEnabled
  );
}

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

export function makePixiLoadPromise(loader: PIXI.Loader): Promise<void> {
  return new Promise((resolve, reject) => {
    loader.onError.add(reject);
    loader.load(resolve as any);
  });
}

export function makeDomContentLoadPromise(
  document: Document
): Promise<true | void> {
  if (_.contains(["complete", "loaded", "interactive"], document.readyState))
    return Promise.resolve(true);

  return new Promise((resolve, reject) => {
    document.addEventListener("DOMContentLoaded", resolve as any);
  });
}

export function sendMetrics(...params: any) {
  if (typeof ga === "undefined") return;

  ga("send", ...params);
}

const eventTimings: { [key: string]: number } = {};
export function startTiming(eventName: string): void {
  eventTimings[eventName] = Date.now();
}
export function endTiming(eventName: string, category = "loading"): void {
  const diff = Date.now() - eventTimings[eventName];
  console.debug("Timing for ", eventName, diff);
  sendMetrics("timing", category, eventName, diff);
}

/* Makes a video element plays easily on iOS. Requires muting */
export function makeVideoElement(): HTMLVideoElement {
  const videoElement = document.createElement("video");
  videoElement.muted = true;
  videoElement.setAttribute("playsinline", "true");
  videoElement.setAttribute("preload", "auto");
  return videoElement;
}

export const REQUIRED_OPTION = new (class REQUIRED_OPTION {})();

// Copies over the defaulted options into obj. Takes care to only copy those options specified in the provided _defaults_
// Options that are required should have a value of REQUIRED_OPTION
export function setupOptions(obj: {}, options: {}, defaults: {}) {
  const requiredKeys = _.chain(defaults)
    .pairs()
    .filter(([key, value]) => value === REQUIRED_OPTION)
    .map(([key, value]) => key)
    .value();
  const providedKeys = _.chain(options)
    .pairs()
    .filter(([key, value]) => !_.isUndefined(value))
    .map(([key, value]) => key)
    .value();
  const missingOptions = _.difference(requiredKeys, providedKeys);
  if (missingOptions.length > 0) {
    console.error("Missing options", missingOptions, "for", obj);
    throw new Error("Missing options");
  }

  const allowedKeys = _.keys(defaults);
  const unneededOptions = _.difference(providedKeys, allowedKeys);
  if (unneededOptions.length > 0) {
    console.warn("Unneeded options", unneededOptions, "for", obj);
  }

  return _.extend(
    obj,
    _.defaults(_.pick(options, _.keys(defaults) as any), defaults)
  );
}

/**
 * Fills in the mising options from the provided defaults
 * @param options Options provided by the caller
 * @param defaults Defaults provided by the author
 */
export function fillInOptions<T extends {}>(
  options: Partial<T>,
  defaults: T
): T {
  if (options) return { ...defaults, ...options };
  else return defaults;
}

export function loadJson(fileName: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("GET", fileName);
    request.responseType = "json";
    request.onload = () => resolve(request.response);
    request.onerror = reject;
    request.send();
  });
}

export async function loadSubtitles(
  fileName: string
): Promise<narration.ParsedSubtitle[]> {
  const plainText = await new Promise<string>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("GET", fileName);
    request.responseType = "text";
    request.onload = () => resolve(String(request.response));
    request.onerror = reject;
    request.send();
  });

  const subtitleRegex =
    /^(\d{2}):(\d{2}):(\d{2}),(\d{3}) --> (\d{2}):(\d{2}):(\d{2}),(\d{3})\n([\S\s]+?)\n\d*\n/gm;

  let match,
    output: narration.ParsedSubtitle[] = [];
  while ((match = subtitleRegex.exec(plainText))) {
    const [
      fullMatch,
      start_h,
      start_m,
      start_s,
      start_ms,
      end_h,
      end_m,
      end_s,
      end_ms,
      text,
    ] = match;

    output.push({
      startsAt:
        +start_ms +
        +start_s * 1000 +
        +start_m * 1000 * 60 +
        +start_h * 1000 * 60 * 60,
      endsAt:
        +end_ms + +end_s * 1000 + +end_m * 1000 * 60 + +end_h * 1000 * 60 * 60,
      text,
    });
  }

  return output;
}

export function stringToBool(s?: string): boolean {
  if (isNullish(s)) return false;

  return !/^(?:false|off|0)$/i.test(s);
}

/**
 * Returns true if @list all of the values in @values.
 * Uses _.contains() internally
 */
export function containsAll<T = any>(list: _.List<T>, values: T[]) {
  for (const value of values) {
    if (!_.contains(list, value)) return false;
  }
  return true;
}

/** Like Underscore's defaults(), excepts merges embedded objects */
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
  [key: string]: any;
  children: Root[];
}
export function setPropertyInTree(root: Root, name: string, value: any): void {
  if (name in root) root[name] = value;

  for (const child of root.children) {
    setPropertyInTree(child, name, value);
  }
}

export type AnimatedSpriteTransitionCallback = boolean | (() => unknown)

export function makeAnimatedSprite(
  resource: PIXI.LoaderResource,
  options?: {
    resetFrame?: boolean;
    transitionOnComplete?: AnimatedSpriteTransitionCallback;
  }
): entity.AnimatedSpriteEntity {
  return new entity.AnimatedSpriteEntity(
    new PIXI.AnimatedSprite(Object.values(resource.textures)),
    options
  );
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
  defaultLanguage = "en"
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
  length: number
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
export function isNullish(x: any): boolean {
  return x == void 0;
}
