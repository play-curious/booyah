import * as _ from "underscore";
import * as PIXI from "pixi.js-legacy";
/** Test containment using _.isEqual() */
export declare function contains<T = any>(list: T[], p: T): boolean;
/** Test containment using _.isEqual() */
export declare function indexOf<T = any>(list: T[], p: T): number;
/** Find unique elements using _.isEqual() */
export declare function uniq<T = any>(array: T[]): T[];
/** Like _.difference(), but uses contains() */
export declare function difference<T = any>(array: T[]): T[];
/** Returns a new array with the given element excluded, tested using _.isEqual() */
export declare function removeFromArray<T = any>(array: T[], value: T): T[];
/** Deep clone of JSON-serializable objects */
export declare function cloneData<T = any>(o: T): T;
/** Picks a random element from the array */
export declare function randomArrayElement<T = any>(array: T[]): T;
export declare function lerpColor(start: number, end: number, fraction: number): number;
export declare function cyclicLerpColor(start: number, end: number, fraction: number): number;
export declare function toFixedFloor(x: number, decimalPlaces: number): number;
export declare function resizeGame(appSize: PIXI.Point): void;
export declare function supportsFullscreen(element: any): boolean;
export declare function requestFullscreen(element: any): void;
export declare function exitFullscreen(): void;
export declare function inFullscreen(): boolean;
export declare function makePixiLoadPromise(loader: PIXI.Loader): Promise<void>;
export declare function makeDomContentLoadPromise(document: Document): Promise<true | void>;
export declare function startTiming(eventName: string): void;
export declare function endTiming(eventName: string, category?: string): void;
export declare function makeVideoElement(): HTMLVideoElement;
export declare const REQUIRED_OPTION: {};
export declare function setupOptions(obj: {}, options: {}, defaults: {}): any;
export declare function loadJson(fileName: string): Promise<any>;
export declare function stringToBool(s: string): boolean;
/**
 * Returns true if @list all of the values in @values.
 * Uses _.contains() internally
 */
export declare function containsAll<T = any>(list: _.List<T>, values: T[]): boolean;
/** Like Underscore's defaults(), excepts merges embedded objects */
export declare function deepDefaults(...args: any[]): any;
export declare function uppercaseFirstLetter(name: string): string;
export declare function shortenString(text: string, maxLength: number): string;
/**
 * Set properties recursively in a PIXI scene graph
 */
export interface Root {
    [key: string]: any;
    children: Root[];
}
export declare function setPropertyInTree(root: Root, name: string, value: any): void;
export declare function getFramesForSpriteSheet(resource: PIXI.LoaderResource): PIXI.Texture[];
export declare function makeAnimatedSprite(resource: PIXI.LoaderResource): PIXI.AnimatedSprite;
/**
 * Determines which language to show the game in.
 *
 * The function looks for langauge information from the following sources, from highest-to-lowest priority:
 * 1. The value of "lang" in the URL query string
 * 2. The value of the "lang" attribute in the HTML element (e.g. `<html lang="fr">`)
 *
 * If no valid language is found, will return the default language.
 */
export declare function determineLanguage(validLanguages?: string[], defaultLanguage?: string): string;
