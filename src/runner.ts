import * as PIXI from "pixi.js";
import * as _ from "underscore";
import Stats from "stats.js";

// @ts-ignore
// eslint-disable-next-line
const FontFaceObserver = require("fontfaceobserver");

import * as entity from "booyah/src/entity";
import * as util from "booyah/src/util";
import * as audio from "booyah/src/audio";

/** String of characters to look for in a font */
const FONT_OBSERVER_CHARS = "asdf";

// Only send updates on non-paused entties
class FilterPauseEntity extends entity.ParallelEntity {
  update(frameInfo: entity.FrameInfo) {
    if (frameInfo.gameState === "playing") super.update(frameInfo);
  }
}

export class PlayOptions extends PIXI.utils.EventEmitter {
  public options: {
    musicOn: boolean;
    fxOn: boolean;
    showSubtitles: boolean;
    sceneParams: {};
    scene: any;
    startingProgress: any;
    fpsMeterPosition: string;
    maxFps?: number;
  };

  constructor(directives: Directives, searchUrl: string) {
    super();

    this.options = {
      musicOn: true,
      fxOn: true,
      showSubtitles: true,
      sceneParams: directives.startingSceneParams,
      scene: directives.startingScene,
      startingProgress: directives.startingProgress,
      fpsMeterPosition: directives.fpsMeterPosition,
    };

    const searchParams = new URLSearchParams(searchUrl);
    if (searchParams.has("music"))
      this.options.musicOn = util.stringToBool(searchParams.get("music"));
    if (searchParams.has("fx"))
      this.options.fxOn = util.stringToBool(searchParams.get("fx"));
    if (searchParams.has("subtitles"))
      this.options.showSubtitles = util.stringToBool(
        searchParams.get("subtitles")
      );
    if (searchParams.has("scene"))
      this.options.scene = searchParams.get("scene");
    if (searchParams.has("params"))
      this.options.sceneParams = JSON.parse(searchParams.get("params"));
    if (searchParams.has("progress"))
      this.options.startingProgress = JSON.parse(searchParams.get("progress"));

    if (
      searchParams.has("mute") &&
      util.stringToBool(searchParams.get("mute"))
    ) {
      this.options.musicOn = false;
      this.options.fxOn = false;
    }

    if (searchParams.has("fps"))
      this.options.fpsMeterPosition = searchParams.get("fps");
    if (searchParams.has("maxFps"))
      this.options.maxFps = parseInt(searchParams.get("maxFps"));
  }

  setOption(name: string, value: any) {
    //@ts-ignore
    this.options[name] = value;
    this.emit(name, value);
    this.emit("change", name, value);
  }

  getOption<T>(name: string): T {
    //@ts-ignore
    return this.options[name];
  }
}

const rootConfig: entity.EntityConfig = {
  loadingEventEmitter: new PIXI.utils.EventEmitter(),
};

let rootEntity: entity.Entity;
let lastFrameInfo: entity.FrameInfo;

let lastFrameTime = 0;

let gameState: entity.GameState = "preloading";
let playTime = 0;
let timeSinceStart = 0;

let loadingScene: entity.Entity;
let pixiLoaderProgress = 0;
let fontLoaderProgress = 0;
let fixedAudioLoaderProgress = 0;

export interface Directives {
  loadingEntity: entity.Entity;
  preloaderAssets: string[];

  rootConfig: entity.EntityConfig;
  rootEntity: entity.Entity;
  loadingPromise: any;
  graphics: any;
  startingSceneParams: any;
  startingScene: any;
  startingProgress: any;
  videoAssets: string[];
  splashScreen: string;
  graphicalAssets: string[];
  fontAssets: string[];
  jsonAssets: Array<string | { key: string; url: string }>;
  subtitleAssets: Array<string>;
  musicAssets: (string | { key: string; url: string })[];
  fxAssets: (string | { key: string; url: string })[];
  extraLoaders: ((entityConfig: entity.EntityConfig) => Promise<any>)[];
  entityInstallers: ((
    entityConfig: entity.EntityConfig,
    entity: entity.ParallelEntity
  ) => void)[];
  states: entity.StateTableDescriptor;
  transitions: entity.TransitionTable;
  endingScenes: string[];
  screenSize: PIXI.IPoint;
  canvasId: string;
  fpsMeterPosition: string;

  /** Function called in the case of an error */
  onError: (e: any) => void;
}

const DEFAULT_DIRECTIVES: any = {
  screenSize: new PIXI.Point(960, 540), // Screen size as PIXI Point
  canvasId: "pixi-canvas", // ID of element to use for PIXI

  // Parameters for the game state machine
  states: [],
  transitions: {},
  startingScene: "start",
  startingSceneParams: {},
  startingProgress: {},
  endingScenes: ["end"],

  // Assets
  graphicalAssets: [], // Graphical assets starting from the root (e.g. "images/image.png")
  musicAssets: [], // No directory or file extension needed
  fxAssets: [], // No directory or file extension needed
  videoAssets: [], // No directory needed
  fontAssets: [], // Font names. The loading should be done separately via CSS.
  jsonAssets: [], // Starting from the root directory. JSON extension in needed
  subtitleAssets: [],

  rootConfig: {}, // Initial value for the rootConfig
  extraLoaders: [], // Will be called after the fixed loading step. Of type function(rootConfig)
  entityInstallers: [], // Will be called when the game is initialized. Of type function(rootConfig, rootEntity)

  language: null,
  supportedLanguages: [], // If included, will show language switching buttons

  fpsMeterPosition: "none",
};

export function startLoading(directives: Partial<Directives> = {}) {
  _.extend(rootConfig, directives.rootConfig);
  setDefaultDirectives(directives);

  // Process starting options
  rootConfig.playOptions = new PlayOptions(
    rootConfig.directives,
    window.location.search
  );

  rootConfig.gameStateMachine = new entity.StateMachine(
    rootConfig.directives.states,
    {
      transitions: rootConfig.directives.transitions,
      startingState: entity.makeTransition(
        rootConfig.playOptions.options.scene,
        rootConfig.playOptions.options.sceneParams
      ),
      startingProgress: rootConfig.playOptions.options.startingProgress,
      endingStates: rootConfig.directives.endingScenes,
    }
  );
  rootConfig.gameStateMachine.on("stateChange", onGameStateMachineChange);

  rootConfig.app = new PIXI.Application({
    width: rootConfig.directives.screenSize.x,
    height: rootConfig.directives.screenSize.y,
    view: document.getElementById(
      rootConfig.directives.canvasId
    ) as HTMLCanvasElement,
  });

  // Create containers below, on, and above the game
  const stage = rootConfig.app.stage;
  rootConfig.containerBelow = stage.addChild(new PIXI.Container());
  rootConfig.container = stage.addChild(new PIXI.Container());
  rootConfig.containerAbove = stage.addChild(new PIXI.Container());

  // Optionally show fps meter
  if (rootConfig.playOptions.options.fpsMeterPosition !== "none")
    showFpsMeter(rootConfig.playOptions.options.fpsMeterPosition);

  util.sendMetrics("send", "event", "loading", "start");
  util.startTiming("preload");

  // Setup preloader
  rootConfig.preloader = makePreloader(
    _.compact([
      rootConfig.directives.preloaderAssets,
      rootConfig.directives.splashScreen,
      rootConfig.directives.gameLogo,
    ])
  );

  const frameInfo: entity.FrameInfo = {
    playTime: 0,
    timeSinceStart: 0,
    timeSinceLastFrame: 0,
    timeScale: 1,
    gameState,
  };
  const loadingPromise = Promise.all([
    util.makeDomContentLoadPromise(document),
    util.makePixiLoadPromise(rootConfig.preloader),
  ])
    .then(() => {
      // Show loading screen as soon as preloader is done
      if (rootConfig.directives.loadingEntity) {
        loadingScene = rootConfig.directives.loadingEntity;

        // The loading scene doesn't get the full entityConfig
        loadingScene.setup(frameInfo, rootConfig, entity.makeTransition());
      }

      // Optionally limit max FPS
      if (rootConfig.playOptions.maxFps) {
        rootConfig.app.ticker.maxFPS = rootConfig.playOptions.maxFps;
      }

      rootConfig.app.ticker.add(update);

      if (rootConfig.playOptions.options.fpsMeterPosition !== "none")
        rootConfig.app.ticker.add(updateFpsMeter);
    })
    .then(() => loadFixedAssets())
    .then(loadVariable)
    .then(doneLoading)
    .catch((err) => {
      console.error("Error during load", err);

      rootConfig.loadingEventEmitter.emit("error", err);
      rootConfig.directives.onError?.(err);

      throw err;
    });

  return {
    rootConfig,
    rootEntity,
    loadingPromise,
  };
}

function onGameStateMachineChange(
  nextStateName: string,
  nextStateParams: unknown,
  previousStateName: string,
  previousStateParams: unknown
) {
  const url = new URL(window.location.href);
  nextStateParams = nextStateParams
    ? // @ts-ignore
      removePrivateProperties(nextStateParams)
    : {};
  url.searchParams.set("scene", nextStateName);
  url.searchParams.set("params", JSON.stringify(nextStateParams));
  url.searchParams.set(
    "progress",
    JSON.stringify(rootConfig.gameStateMachine.progress)
  );

  console.log("New game state:", nextStateName, nextStateParams);
  console.log("New game state link:", url.href);
}

function removePrivateProperties(obj: object) {
  const result: object = {};
  for (const key in obj) {
    // @ts-ignore
    if (!key.startsWith("_")) result[key] = obj[key];
  }
  return result;
}

function makePreloader(additionalAssets: string[]) {
  const loader = new PIXI.Loader();
  loader.add(additionalAssets);
  return loader;
}

function setDefaultDirectives(directives: Partial<Directives>) {
  rootConfig.directives = util.deepDefaults(directives, DEFAULT_DIRECTIVES);
}
function updateLoadingProgress() {
  const progress =
    (pixiLoaderProgress + fontLoaderProgress + fixedAudioLoaderProgress) / 3;
  // console.debug("loading progress", progress, {
  //   pixiLoaderProgress,
  //   fontLoaderProgress,
  //   fixedAudioLoaderProgress,
  //   variableAudioLoaderProgress,
  //   videoLoaderProgress,
  // });

  rootConfig.loadingEventEmitter.emit("progress", progress);
}

function pixiLoadProgressHandler(loader: unknown, resource?: unknown): void {
  // @ts-ignore
  pixiLoaderProgress = loader.progress / 100;
  updateLoadingProgress();
}

function update(timeScale: number) {
  const frameTime = Date.now();
  // Clamp time since last frame to be under 10 FPS
  const timeSinceLastFrame = Math.min(frameTime - lastFrameTime, 100);
  lastFrameTime = frameTime;

  // Only count "play time" as compared to clock time
  if (gameState == "playing") {
    playTime += timeSinceLastFrame;
    timeSinceStart += timeSinceLastFrame;
  }

  const entityToUpdate = rootEntity || loadingScene;
  if (entityToUpdate) {
    lastFrameInfo = {
      playTime,
      timeSinceStart,
      timeSinceLastFrame,
      timeScale,
      gameState,
    };

    try {
      entityToUpdate.update(lastFrameInfo);

      rootConfig.app.renderer.render(rootConfig.app.stage);
    } catch (e: any) {
      // If an error handler is provided, call it. Otherwise rethrow
      if (rootConfig.directives.onError) {
        rootConfig.directives.onError(e);
      } else {
        throw e;
      }

      // // Teardown the current entity and remove it
      // entityToUpdate.teardown(lastFrameInfo);

      // if (rootEntity) rootEntity = undefined;
      // if (loadingScene) loadingScene = undefined;
    }
  }
}

export function changeGameState(newGameState: entity.GameState) {
  console.log("switching from game state", gameState, "to", newGameState);

  const previousGameState = gameState;
  gameState = newGameState;

  if (lastFrameInfo) lastFrameInfo.gameState = newGameState;

  if (previousGameState !== newGameState) {
    if (previousGameState == "playing" && newGameState == "paused") {
      rootEntity.onSignal(lastFrameInfo, "pause");
    } else if (previousGameState == "paused" && newGameState == "playing") {
      rootEntity.onSignal(lastFrameInfo, "play");
    }
  }

  util.sendMetrics("send", "event", "changeGameState", newGameState);
}

export function changeRootEntity(newRootEntity: entity.Entity): void {
  if (rootEntity) {
    // Teardown the current entity
    rootEntity.teardown(lastFrameInfo);
  }

  rootEntity = newRootEntity;
  rootEntity.setup(lastFrameInfo, rootConfig, entity.makeTransition());
}

function loadFixedAssets() {
  changeGameState("loadingFixed");

  util.endTiming("preload");
  util.startTiming("loadFixed");

  // Load graphical assets
  rootConfig.app.loader.add(rootConfig.directives.graphicalAssets);
  rootConfig.app.loader.onProgress.add(pixiLoadProgressHandler);

  const fonts = rootConfig.directives.fontAssets;
  const fontLoaderPromises = _.map(fonts, (name) => {
    return new FontFaceObserver(name)
      .load(FONT_OBSERVER_CHARS)
      .then(() => {
        fontLoaderProgress += 1 / fonts.length;
        updateLoadingProgress();
      })
      .catch((e: Error) => {
        console.warn("Cannot load font", name, "due to error", e);

        // On Firefox, this will randomly timeout although font was loaded correctly
        // throw e;
      });
  });

  // load json
  rootConfig.jsonAssets = {};
  const jsonLoaderPromises = _.map(
    rootConfig.directives.jsonAssets,
    (jsonAssetDescription: string | object) => {
      if (_.isString(jsonAssetDescription)) {
        return util.loadJson(jsonAssetDescription).then((data) => {
          rootConfig.jsonAssets[jsonAssetDescription] = data;
        });
      } else if (
        _.isObject(jsonAssetDescription) &&
        jsonAssetDescription.key &&
        jsonAssetDescription.url
      ) {
        return util.loadJson(jsonAssetDescription.url).then((data) => {
          rootConfig.jsonAssets[jsonAssetDescription.key] = data;
        });
      } else {
        throw new Error(
          `Unrecognized JSON asset description '${JSON.stringify(
            jsonAssetDescription
          )}'`
        );
      }
    }
  );

  // load subtitles
  rootConfig.subtitles = {};
  const subtitleLoaderPromises = _.map(
    rootConfig.directives.subtitleAssets,
    (name: string) => {
      return util.loadSubtitles(`subtitles/${name}.srt`).then((parsed) => {
        rootConfig.subtitles[name] = parsed;
      });
    }
  );

  // Load audio
  rootConfig.musicAudio = audio.makeHowls(
    "music",
    rootConfig.directives.musicAssets
  );
  const musicLoadPromises = _.map(
    rootConfig.musicAudio,
    audio.makeHowlerLoadPromise
  );

  rootConfig.fxAudio = audio.makeHowls("fx", rootConfig.directives.fxAssets);
  const fxLoadPromises = _.map(rootConfig.fxAudio, audio.makeHowlerLoadPromise);

  const fixedAudioLoaderPromises = [...musicLoadPromises, ...fxLoadPromises];
  _.each(fixedAudioLoaderPromises, (p) =>
    p.then(() => {
      fixedAudioLoaderProgress += 1 / fixedAudioLoaderPromises.length;
      updateLoadingProgress();
    })
  );

  const promises = _.flatten(
    [
      util.makePixiLoadPromise(rootConfig.app.loader),
      fontLoaderPromises,
      fixedAudioLoaderPromises,
      jsonLoaderPromises,
      subtitleLoaderPromises,
    ],
    true
  );

  return Promise.all(promises).catch((err) => {
    console.error("Error loading fixed assets", err);
    throw err;
  });
}

function loadVariable() {
  util.endTiming("loadFixed");
  util.startTiming("loadVariable");

  if (!rootConfig.directives.extraLoaders) return Promise.resolve([]);

  const loadingPromises = [];
  for (const loader of rootConfig.directives.extraLoaders) {
    // TODO: handle progress
    const newPromise = loader(rootConfig);
    loadingPromises.push(newPromise);
  }

  return Promise.all(loadingPromises).catch((err) => {
    console.error("Error in variable loading stage", err);
    throw err;
  });
}

let fpsMeter: Stats;
function showFpsMeter(position: string) {
  fpsMeter = new Stats();
  fpsMeter.showPanel(0);
  fpsMeter.begin();
  document.body.appendChild(fpsMeter.dom);

  switch (position) {
    // upper-left is default

    case "upper-right": {
      fpsMeter.dom.style.removeProperty("left");
      fpsMeter.dom.style.right = "0";
      break;
    }
    case "lower-right": {
      fpsMeter.dom.style.removeProperty("left");
      fpsMeter.dom.style.removeProperty("top");
      fpsMeter.dom.style.right = "0";
      fpsMeter.dom.style.bottom = "0";
      break;
    }
    case "lower-left": {
      fpsMeter.dom.style.removeProperty("top");
      fpsMeter.dom.style.bottom = "0";
      break;
    }
  }
}

function updateFpsMeter() {
  fpsMeter.end();
  fpsMeter.begin();
}

function doneLoading() {
  lastFrameInfo = {
    playTime: 0,
    timeSinceStart: 0,
    timeSinceLastFrame: 0,
    timeScale: 1,
    gameState,
  };

  util.endTiming("loadVariable");

  rootConfig.loadingEventEmitter.emit("done");
}

export function startGame(): void {
  util.startTiming("playing");

  changeGameState("playing");

  // Remove loading screen
  loadingScene?.teardown(lastFrameInfo);
  loadingScene = null;

  // The new rootEntity will contain all the sub entities
  const parallelRootEntity = new entity.ParallelEntity();
  rootEntity = parallelRootEntity;

  for (const installer of rootConfig.directives.entityInstallers) {
    installer(rootConfig, rootEntity);
  }

  // Filter out the pause event for the game sequence
  parallelRootEntity.addChildEntity(
    new FilterPauseEntity([
      new entity.ContainerEntity([rootConfig.gameStateMachine], "gameSequence"),
    ])
  );

  setupVisibilityDetection();

  rootEntity.setup(lastFrameInfo, rootConfig, entity.makeTransition());
}

/** Detect when the page is not shown, and pause the game */
function setupVisibilityDetection() {
  // Based on https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API
  const d = document;

  let hiddenProperty: string;
  let visibilityChangeProperty: string;

  if (typeof d.hidden !== "undefined") {
    // Opera 12.10 and Firefox 18 and later support
    hiddenProperty = "hidden";
    visibilityChangeProperty = "visibilitychange";
    // @ts-ignore
  } else if (typeof d.msHidden !== "undefined") {
    hiddenProperty = "msHidden";
    visibilityChangeProperty = "msvisibilitychange";
    // @ts-ignore
  } else if (typeof d.webkitHidden !== "undefined") {
    hiddenProperty = "webkitHidden";
    visibilityChangeProperty = "webkitvisibilitychange";
  }

  // If the page is hidden, pause the video;
  // if the page is shown, play the video
  function handleVisibilityChange() {
    // @ts-ignore
    if (d[hiddenProperty]) {
      console.log("Lost visibility. Hiding the game");

      rootEntity.onSignal(lastFrameInfo, "lostVisibility");
      changeGameState("paused");
    } else {
      rootEntity.onSignal(lastFrameInfo, "gainedVisibility");
      // Let the game handle unpausing
    }
  }

  // Warn if the browser doesn't support addEventListener or the Page Visibility API
  if (
    typeof d.addEventListener === "undefined" ||
    hiddenProperty === undefined
  ) {
    console.warn("Page Visibility API not supported on this browser");
  } else {
    // Handle page visibility change
    d.addEventListener(visibilityChangeProperty, handleVisibilityChange, false);
  }
}
