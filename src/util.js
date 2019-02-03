

// Test containment using isEqual
export function contains(list, p) {
  for(let x of list) {
    if(_.isEqual(x, p)) return true;
  }
  return false;
} 

// Test containment using isEqual
export function indexOf(list, p) {
  for(let i = 0; i < list.length; i++) {
    if(_.isEqual(list[i], p)) return i;
  }
  return -1;
} 

// Find unique elements using isEqual
export function uniq(array) {
  let results = [];
  let seen = [];
  array.forEach((value, index) => {
    if(!contains(seen, value)) {
      seen.push(value)
      results.push(array[index])
    }
  });
  return results;
}

// Like Underscore's method, but uses contains()
export function difference(array) {
  rest = Array.prototype.concat.apply(Array.prototype, Array.prototype.slice.call(arguments, 1));
  return _.filter(array, (value) => !contains(rest, value));
}

// Uses contains()
export function removeFromArray(array, value) {
  let ret = [];
  for(let element of array) if(!_.isEqual(element, value)) ret.push(element);
  return ret;
}

export function cloneData(o) {
  return JSON.parse(JSON.stringify(o));
} 


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
  return fraction < 0.5 ? lerpColor(start, end, fraction / 0.5) : lerpColor(end, start, (fraction - 0.5) / 0.5);
}

export function toFixedFloor(x, decimalPlaces) {
  const divider = Math.pow(10, decimalPlaces);
  return (Math.floor(x * divider) / divider).toFixed(decimalPlaces);
}

export function resizeGame(appSize) {
  const parentSize = new PIXI.Point(window.innerWidth, window.innerHeight);
  const scale = toFixedFloor(Math.min(parentSize.x / appSize.x, parentSize.y / appSize.y), 2);

  const newSize = multiply(appSize, scale);
  const remainingSpace = subtract(parentSize, newSize);

  console.log("setting scale to", scale);

  const parent = document.getElementById("game-parent");
  parent.style.height = `${newSize.y}px`;

  const container = document.getElementById("game-container");
  const transformCss = `translate(${(remainingSpace.x / 2).toFixed(2)}px, 0px) scale(${scale})`;
  for(const prop of ["transform", "webkitTransform", "msTransform"]) {
    container.style[prop] = transformCss;
  }
}

export function supportsFullscreen(element) {
  return !!(element.requestFullscreen 
    || element.mozRequestFullScreen 
    || element.webkitRequestFullscreen 
    || element.msRequestFullscreen);
}

export function requestFullscreen(element) {
  if(element.requestFullscreen) {
    element.requestFullscreen();
  } else if(element.mozRequestFullScreen) {
    element.mozRequestFullScreen();
  } else if(element.webkitRequestFullscreen) {
    element.webkitRequestFullscreen();
  } else if(element.msRequestFullscreen) {
    element.msRequestFullscreen();
  }
}

export function exitFullscreen() {
  if(document.exitFullscreen) document.exitFullscreen();
  else if(document.webkitExitFullscreen) document.webkitExitFullscreen();
  else if(document.mozCancelFullScreen) document.mozCancelFullScreen();
  else if(document.msExitFullscreen) document.msExitFullscreen();
} 

export function inFullscreen() {
  return document.fullscreenElement 
    || document.webkitFullscreenElement
    || document.mozFullScreenElement
    || document.msFullScreenElement;
}

export function makePixiLoadPromise(loader) {
  return new Promise((resolve, reject) => {
    loader.onError.add(reject);
    loader.load(resolve);
  });  
}

export function makeDomContentLoadPromise(document) {
  return new Promise((resolve, reject) => {
    document.addEventListener("DOMContentLoaded", resolve);
  });
}

const eventTimings = {};
export function startTiming(eventName) {
  eventTimings[eventName] = Date.now();
}
export function endTiming(eventName, category="loading") {
  const diff = Date.now() - eventTimings[eventName];
  console.debug("Timing for ", eventName, diff);
  ga("send", "timing", category, eventName, diff);
}

/* Makes a video element plays easily on iOS. Requires muting */
export function makeVideoElement() {
  const videoElement = document.createElement("video");
  videoElement.muted = true;
  videoElement.setAttribute("playsinline", true);
  return videoElement;
}

// Copies over the defaulted options into obj. Takes care to only copy those options specified in the provided _defaults_
export function setupOptions(obj, options, defaults) {
  return _.extend(obj, _.defaults(_.pick(options, _.keys(defaults)), defaults));
}
