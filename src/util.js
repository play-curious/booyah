import * as geom from "./geom";
import * as _ from 'underscore';
import * as PIXI from 'pixi.js-legacy';
/** Test containment using _.isEqual() */
export function contains(list, p) {
    for (let x of list) {
        if (_.isEqual(x, p))
            return true;
    }
    return false;
}
/** Test containment using _.isEqual() */
export function indexOf(list, p) {
    for (let i = 0; i < list.length; i++) {
        if (_.isEqual(list[i], p))
            return i;
    }
    return -1;
}
/** Find unique elements using _.isEqual() */
export function uniq(array) {
    let results = [];
    let seen = [];
    array.forEach((value, index) => {
        if (!contains(seen, value)) {
            seen.push(value);
            results.push(array[index]);
        }
    });
    return results;
}
/** Like _.difference(), but uses contains() */
export function difference(array) {
    const rest = Array.prototype.concat.apply(Array.prototype, Array.prototype.slice.call(arguments, 1));
    return _.filter(array, value => !contains(rest, value));
}
/** Returns a new array with the given element excluded, tested using _.isEqual() */
export function removeFromArray(array, value) {
    let ret = [];
    for (let element of array)
        if (!_.isEqual(element, value))
            ret.push(element);
    return ret;
}
/** Deep clone of JSON-serializable objects */
export function cloneData(o) {
    return JSON.parse(JSON.stringify(o));
}
/** Picks a random element from the array */
export function randomArrayElement(array) {
    return array[_.random(0, array.length - 1)];
}
export function lerpColor(start, end, fraction) {
    const r = ((end & 0xff0000) >> 16) - ((start & 0xff0000) >> 16);
    const g = ((end & 0x00ff00) >> 8) - ((start & 0x00ff00) >> 8);
    const b = (end & 0x0000ff) - (start & 0x0000ff);
    return start + ((r * fraction) << 16) + ((g * fraction) << 8) + b;
}
export function cyclicLerpColor(start, end, fraction) {
    return fraction < 0.5
        ? lerpColor(start, end, fraction / 0.5)
        : lerpColor(end, start, (fraction - 0.5) / 0.5);
}
export function toFixedFloor(x, decimalPlaces) {
    const divider = Math.pow(10, decimalPlaces);
    return Number((Math.floor(x * divider) / divider).toFixed(decimalPlaces));
}
export function resizeGame(appSize) {
    const parentSize = new PIXI.Point(window.innerWidth, window.innerHeight);
    const scale = toFixedFloor(Math.min(parentSize.x / appSize.x, parentSize.y / appSize.y), 2);
    const newSize = geom.multiply(appSize, scale);
    const remainingSpace = geom.subtract(parentSize, newSize);
    console.log("setting scale to", scale);
    const parent = document.getElementById("game-parent");
    parent.style.height = `${newSize.y}px`;
    const container = document.getElementById("game-container");
    const transformCss = `translate(${(remainingSpace.x / 2).toFixed(2)}px, 0px) scale(${scale})`;
    for (const prop of ["transform", "webkitTransform", "msTransform"]) {
        // @ts-ignore
        container.style[prop] = transformCss;
    }
}
export function supportsFullscreen(element) {
    return !!(element.requestFullscreen ||
        element.mozRequestFullScreen ||
        element.webkitRequestFullscreen ||
        element.msRequestFullscreen);
}
export function requestFullscreen(element) {
    if (element.requestFullscreen) {
        element.requestFullscreen();
    }
    else if (element.mozRequestFullScreen) {
        element.mozRequestFullScreen();
    }
    else if (element.webkitRequestFullscreen) {
        element.webkitRequestFullscreen();
    }
    else if (element.msRequestFullscreen) {
        element.msRequestFullscreen();
    }
}
export function exitFullscreen() {
    if (document.exitFullscreen)
        document.exitFullscreen().catch();
    //@ts-ignore
    else if (document.webkitExitFullscreen)
        document.webkitExitFullscreen();
    //@ts-ignore
    else if (document.mozCancelFullScreen)
        document.mozCancelFullScreen();
    //@ts-ignore
    else if (document.msExitFullscreen)
        document.msExitFullscreen();
}
export function inFullscreen() {
    return !!(document.fullscreenElement ||
        //@ts-ignore
        document.webkitFullscreenElement ||
        //@ts-ignore
        document.mozFullScreenElement ||
        //@ts-ignore
        document.msFullScreenElement);
}
export function makePixiLoadPromise(loader) {
    return new Promise((resolve, reject) => {
        loader.onError.add(reject);
        loader.load(resolve);
    });
}
export function makeDomContentLoadPromise(document) {
    if (_.contains(["complete", "loaded", "interactive"], document.readyState))
        return Promise.resolve(true);
    return new Promise((resolve, reject) => {
        document.addEventListener("DOMContentLoaded", resolve);
    });
}
const eventTimings = {};
export function startTiming(eventName) {
    eventTimings[eventName] = Date.now();
}
export function endTiming(eventName, category = "loading") {
    const diff = Date.now() - eventTimings[eventName];
    console.debug("Timing for ", eventName, diff);
    //ga("send", "timing", category, eventName, diff);
}
/* Makes a video element plays easily on iOS. Requires muting */
export function makeVideoElement() {
    const videoElement = document.createElement("video");
    videoElement.muted = true;
    videoElement.setAttribute("playsinline", "true");
    videoElement.setAttribute("preload", "auto");
    return videoElement;
}
export const REQUIRED_OPTION = new (class REQUIRED_OPTION {
})();
// Copies over the defaulted options into obj. Takes care to only copy those options specified in the provided _defaults_
// Options that are required should have a value of REQUIRED_OPTION
export function setupOptions(obj, options, defaults) {
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
    return _.extend(obj, _.defaults(_.pick(options, _.keys(defaults)), defaults));
}
export function loadJson(fileName) {
    return new Promise((resolve, reject) => {
        const request = new XMLHttpRequest();
        request.open("GET", fileName);
        request.responseType = "json";
        request.onload = () => resolve(request.response);
        request.onerror = reject;
        request.send();
    });
}
export function stringToBool(s) {
    return !/^(?:false|off|0)$/i.test(s);
}
/**
 * Returns true if @list all of the values in @values.
 * Uses _.contains() internally
 */
export function containsAll(list, values) {
    for (const value of values) {
        if (!_.contains(list, value))
            return false;
    }
    return true;
}
/** Like Underscore's defaults(), excepts merges embedded objects */
export function deepDefaults(...args) {
    if (args.length === 0)
        return {};
    const result = args[0];
    for (let i = 1; i < args.length; i++) {
        const a = args[i];
        for (const key in a) {
            const value = a[key];
            if (_.isUndefined(value))
                continue;
            if (!_.has(result, key)) {
                result[key] = value;
            }
            else if (_.isObject(result[key])) {
                deepDefaults(result[key], value);
            }
        }
    }
    return result;
}
export function uppercaseFirstLetter(name) {
    return name[0].toUpperCase() + name.substring(1);
}
export function shortenString(text, maxLength) {
    if (text.length <= maxLength)
        return text;
    return text.substr(0, maxLength - 3) + "...";
}
export function setPropertyInTree(root, name, value) {
    if (name in root)
        root[name] = value;
    for (const child of root.children) {
        setPropertyInTree(child, name, value);
    }
}
export function getFramesForSpriteSheet(resource) {
    return _.map(resource.textures, value => value);
}
export function makeAnimatedSprite(resource) {
    return new PIXI.AnimatedSprite(getFramesForSpriteSheet(resource));
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
export function determineLanguage(validLanguages = ["en"], defaultLanguage = "en") {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXRpbC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uL3R5cGVzY3JpcHQvdXRpbC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxPQUFPLEtBQUssSUFBSSxNQUFNLFFBQVEsQ0FBQztBQUMvQixPQUFPLEtBQUssQ0FBQyxNQUFNLFlBQVksQ0FBQztBQUVoQyxPQUFPLEtBQUssSUFBSSxNQUFNLGdCQUFnQixDQUFDO0FBRXZDLHlDQUF5QztBQUN6QyxNQUFNLFVBQVUsUUFBUSxDQUFRLElBQVEsRUFBRSxDQUFHO0lBQzNDLEtBQUssSUFBSSxDQUFDLElBQUksSUFBSSxFQUFFO1FBQ2xCLElBQUksQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDO1lBQUUsT0FBTyxJQUFJLENBQUM7S0FDbEM7SUFDRCxPQUFPLEtBQUssQ0FBQztBQUNmLENBQUM7QUFFRCx5Q0FBeUM7QUFDekMsTUFBTSxVQUFVLE9BQU8sQ0FBUSxJQUFRLEVBQUUsQ0FBRztJQUMxQyxLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDLEVBQUUsRUFBRTtRQUNwQyxJQUFJLENBQUMsQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUFFLE9BQU8sQ0FBQyxDQUFDO0tBQ3JDO0lBQ0QsT0FBTyxDQUFDLENBQUMsQ0FBQztBQUNaLENBQUM7QUFFRCw2Q0FBNkM7QUFDN0MsTUFBTSxVQUFVLElBQUksQ0FBUSxLQUFTO0lBQ25DLElBQUksT0FBTyxHQUFPLEVBQUUsQ0FBQztJQUNyQixJQUFJLElBQUksR0FBTyxFQUFFLENBQUM7SUFDbEIsS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDLEtBQUssRUFBRSxLQUFLLEVBQUUsRUFBRTtRQUM3QixJQUFJLENBQUMsUUFBUSxDQUFDLElBQUksRUFBRSxLQUFLLENBQUMsRUFBRTtZQUMxQixJQUFJLENBQUMs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