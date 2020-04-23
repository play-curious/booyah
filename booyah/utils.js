"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const geom = require("./geom");
const _ = require("underscore");
/** Test containment using _.isEqual() */
function contains(list, p) {
    for (let x of list) {
        if (_.isEqual(x, p))
            return true;
    }
    return false;
}
exports.contains = contains;
/** Test containment using _.isEqual() */
function indexOf(list, p) {
    for (let i = 0; i < list.length; i++) {
        if (_.isEqual(list[i], p))
            return i;
    }
    return -1;
}
exports.indexOf = indexOf;
/** Find unique elements using _.isEqual() */
function uniq(array) {
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
exports.uniq = uniq;
/** Like _.difference(), but uses contains() */
function difference(array) {
    const rest = Array.prototype.concat.apply(Array.prototype, Array.prototype.slice.call(arguments, 1));
    return _.filter(array, value => !contains(rest, value));
}
exports.difference = difference;
/** Returns a new array with the given element excluded, tested using _.isEqual() */
function removeFromArray(array, value) {
    let ret = [];
    for (let element of array)
        if (!_.isEqual(element, value))
            ret.push(element);
    return ret;
}
exports.removeFromArray = removeFromArray;
/** Deep clone of JSON-serializable objects */
function cloneData(o) {
    return JSON.parse(JSON.stringify(o));
}
exports.cloneData = cloneData;
/** Picks a random element from the array */
function randomArrayElement(array) {
    return array[_.random(0, array.length - 1)];
}
exports.randomArrayElement = randomArrayElement;
function lerpColor(start, end, fraction) {
    const r = ((end & 0xff0000) >> 16) - ((start & 0xff0000) >> 16);
    const g = ((end & 0x00ff00) >> 8) - ((start & 0x00ff00) >> 8);
    const b = (end & 0x0000ff) - (start & 0x0000ff);
    return start + ((r * fraction) << 16) + ((g * fraction) << 8) + b;
}
exports.lerpColor = lerpColor;
function cyclicLerpColor(start, end, fraction) {
    return fraction < 0.5
        ? lerpColor(start, end, fraction / 0.5)
        : lerpColor(end, start, (fraction - 0.5) / 0.5);
}
exports.cyclicLerpColor = cyclicLerpColor;
function toFixedFloor(x, decimalPlaces) {
    const divider = Math.pow(10, decimalPlaces);
    return Number((Math.floor(x * divider) / divider).toFixed(decimalPlaces));
}
exports.toFixedFloor = toFixedFloor;
function resizeGame(appSize) {
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
exports.resizeGame = resizeGame;
function supportsFullscreen(element) {
    return !!(element.requestFullscreen ||
        element.mozRequestFullScreen ||
        element.webkitRequestFullscreen ||
        element.msRequestFullscreen);
}
exports.supportsFullscreen = supportsFullscreen;
function requestFullscreen(element) {
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
exports.requestFullscreen = requestFullscreen;
function exitFullscreen() {
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
exports.exitFullscreen = exitFullscreen;
function inFullscreen() {
    return !!(document.fullscreenElement ||
        //@ts-ignore
        document.webkitFullscreenElement ||
        //@ts-ignore
        document.mozFullScreenElement ||
        //@ts-ignore
        document.msFullScreenElement);
}
exports.inFullscreen = inFullscreen;
function makePixiLoadPromise(loader) {
    return new Promise((resolve, reject) => {
        loader.onError.add(reject);
        loader.load(resolve);
    });
}
exports.makePixiLoadPromise = makePixiLoadPromise;
function makeDomContentLoadPromise(document) {
    if (_.contains(["complete", "loaded", "interactive"], document.readyState))
        return Promise.resolve(true);
    return new Promise((resolve, reject) => {
        document.addEventListener("DOMContentLoaded", resolve);
    });
}
exports.makeDomContentLoadPromise = makeDomContentLoadPromise;
const eventTimings = {};
function startTiming(eventName) {
    eventTimings[eventName] = Date.now();
}
exports.startTiming = startTiming;
function endTiming(eventName, category = "loading") {
    const diff = Date.now() - eventTimings[eventName];
    console.debug("Timing for ", eventName, diff);
    //ga("send", "timing", category, eventName, diff);
}
exports.endTiming = endTiming;
/* Makes a video element plays easily on iOS. Requires muting */
function makeVideoElement() {
    const videoElement = document.createElement("video");
    videoElement.muted = true;
    videoElement.setAttribute("playsinline", "true");
    videoElement.setAttribute("preload", "auto");
    return videoElement;
}
exports.makeVideoElement = makeVideoElement;
exports.REQUIRED_OPTION = new (class REQUIRED_OPTION {
})();
// Copies over the defaulted options into obj. Takes care to only copy those options specified in the provided _defaults_
// Options that are required should have a value of REQUIRED_OPTION
function setupOptions(obj, options, defaults) {
    const requiredKeys = _.chain(defaults)
        .pairs()
        .filter(([key, value]) => value === exports.REQUIRED_OPTION)
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
exports.setupOptions = setupOptions;
function loadJson(fileName) {
    return new Promise((resolve, reject) => {
        const request = new XMLHttpRequest();
        request.open("GET", fileName);
        request.responseType = "json";
        request.onload = () => resolve(request.response);
        request.onerror = reject;
        request.send();
    });
}
exports.loadJson = loadJson;
function stringToBool(s) {
    return !/^(?:false|off|0)$/i.test(s);
}
exports.stringToBool = stringToBool;
/**
 * Returns true if @list all of the values in @values.
 * Uses _.contains() internally
 */
function containsAll(list, values) {
    for (const value of values) {
        if (!_.contains(list, value))
            return false;
    }
    return true;
}
exports.containsAll = containsAll;
/** Like Underscore's defaults(), excepts merges embedded objects */
function deepDefaults(...args) {
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
exports.deepDefaults = deepDefaults;
function uppercaseFirstLetter(name) {
    return name[0].toUpperCase() + name.substring(1);
}
exports.uppercaseFirstLetter = uppercaseFirstLetter;
function shortenString(text, maxLength) {
    if (text.length <= maxLength)
        return text;
    return text.substr(0, maxLength - 3) + "...";
}
exports.shortenString = shortenString;
function setPropertyInTree(root, name, value) {
    if (name in root)
        root[name] = value;
    for (const child of root.children) {
        setPropertyInTree(child, name, value);
    }
}
exports.setPropertyInTree = setPropertyInTree;
function getFramesForSpriteSheet(resource) {
    return _.map(resource.textures, value => value);
}
exports.getFramesForSpriteSheet = getFramesForSpriteSheet;
function makeAnimatedSprite(resource) {
    return new PIXI.AnimatedSprite(getFramesForSpriteSheet(resource));
}
exports.makeAnimatedSprite = makeAnimatedSprite;
/**
 * Determines which language to show the game in.
 *
 * The function looks for langauge information from the following sources, from highest-to-lowest priority:
 * 1. The value of "lang" in the URL query string
 * 2. The value of the "lang" attribute in the HTML element (e.g. `<html lang="fr">`)
 *
 * If no valid language is found, will return the default language.
 */
function determineLanguage(validLanguages = ["en"], defaultLanguage = "en") {
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
exports.determineLanguage = determineLanguage;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXRpbHMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvdXRpbHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFBQSwrQkFBK0I7QUFDL0IsZ0NBQWdDO0FBR2hDLHlDQUF5QztBQUN6QyxTQUFnQixRQUFRLENBQVEsSUFBUSxFQUFFLENBQUc7SUFDekMsS0FBSyxJQUFJLENBQUMsSUFBSSxJQUFJLEVBQUU7UUFDaEIsSUFBSSxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUM7WUFBRSxPQUFPLElBQUksQ0FBQztLQUNwQztJQUNELE9BQU8sS0FBSyxDQUFDO0FBQ2pCLENBQUM7QUFMRCw0QkFLQztBQUVELHlDQUF5QztBQUN6QyxTQUFnQixPQUFPLENBQVEsSUFBUSxFQUFFLENBQUc7SUFDeEMsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLEVBQUU7UUFDbEMsSUFBSSxDQUFDLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUM7WUFBRSxPQUFPLENBQUMsQ0FBQztLQUN2QztJQUNELE9BQU8sQ0FBQyxDQUFDLENBQUM7QUFDZCxDQUFDO0FBTEQsMEJBS0M7QUFFRCw2Q0FBNkM7QUFDN0MsU0FBZ0IsSUFBSSxDQUFRLEtBQVM7SUFDakMsSUFBSSxPQUFPLEdBQU8sRUFBRSxDQUFDO0lBQ3JCLElBQUksSUFBSSxHQUFPLEVBQUUsQ0FBQztJQUNsQixLQUFLLENBQUMsT0FBTyxDQUFDLENBQUMsS0FBSyxFQUFFLEtBQUssRUFBRSxFQUFFO1FBQzNCLElBQUksQ0FBQyxRQUFRLENBQUMsSUFBSSxFQUFFLEtBQUssQ0FBQyxFQUFFO1lBQ3hCLElBQUksQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUM7WUFDakIsT0FBTyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUMs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