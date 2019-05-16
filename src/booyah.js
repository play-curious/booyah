import * as util from "./util.js";
import * as entity from "./entity.js";
import * as narration from "./narration.js";
import * as audio from "./audio.js";

const DEFAULT_CONFIG = {
  screenSize: new PIXI.Point(960, 540),
  canvasId: "pixi-canvas",
  states: [],
  transitions: {},
  startingScene: "start",
  endingScene: "end",
  graphicalAssets: [],
  musicAssets: [],
  fxAssets: [],
  videoAssets: [],
  fontsAssets: [],
  speakers: {},
  speakerPosition: new PIXI.Point(50, 540),
  credits: {},
  splashScreen: null,
  gameLogo: null
};

const GRAPHICAL_ASSETS = [
  "booyah/images/a-playcurious-game.png",
  "booyah/images/button-back.png",
  "booyah/images/button-close.png",
  "booyah/images/button-mainmenu.png",
  "booyah/images/button-skip.png",
  "booyah/images/button-play.png",
  "booyah/images/button-replay.png",
  "booyah/images/fullscreen-off.png",
  "booyah/images/fullscreen-on.png",
  "booyah/images/fullscreen-disabled.png",
  "booyah/images/lang-en-off.png",
  "booyah/images/lang-en-on.png",
  "booyah/images/lang-fr-off.png",
  "booyah/images/lang-fr-on.png",
  "booyah/images/music-off.png",
  "booyah/images/music-on.png",
  "booyah/images/subtitles-off.png",
  "booyah/images/subtitles-on.png",
  "booyah/images/voices-off.png",
  "booyah/images/voices-on.png"
];

// String of characters to look for in a font
const FONT_OBSERVER_CHARS = "asdf";

const PRELOADER_ASSETS = ["booyah/images/loader-circle.png"];
const LOADING_SCENE_SPIN_SPEED = Math.PI / 60; // One spin in 2s

const startingOptions = {
  mute: false,
  muteMusic: false,
  muteFx: false,
  noSubtitles: false,
  sceneParams: {}
};

let booyahConfig;
let app;
let preloader;
let loadingScene;
let rootEntity;
let gameSequence;
let gameStateMachine;

let currentSceneEntity;
let currentScene;
let currentSceneDisplay;
let lastFrameTime = 0;

// narrationAudio is a map of file names to Howl objects, configured with sprite defs
let narrationAudio;
let narrator;

// musicAudio is a map of file names to Howl objects
let musicAudio;
let jukebox;

let fxAudio;
let fxMachine;

// The format is key: { text: string, [file: string], [start: int], [end: int], [skipFile: bool] }
// If start is omitted, entire file will play
// If file is omitted, the file name will be the key name followed by a underscore and the language code, like "intro_fr.mp3"
// If skipFile is true, the filename is not used
let narrationTable;

let previousGameState = null;
let gameState = "loadingA"; // One of "loadingA", "loadingB", "ready", "playing", "paused", "done"
let playTime = 0;
let timeSinceStart = 0;

// TODO: these multiple entities could be put in some kind of composite "overlay entity" to ease updating
let menuEntity;
let speakerDisplay;

let pixiLoaderProgress = 0;
let fontLoaderProgress = 0;
let audioLoaderProgress = 0;

// Only send updates on non-paused entties
class FilterPauseEntity extends entity.CompositeEntity {
  update(options) {
    if (options.gameState == "playing") super.update(options);
  }
}

export class MenuEntity extends entity.ParallelEntity {
  constructor(credits, gameLogo) {
    super();

    this.credits = credits;
    this.gameLogo = gameLogo;
  }

  setup(config) {
    super.setup(config);

    this.container = new PIXI.Container();
    this.container.name = "menu";

    this.creditsEntity = null;

    this.pauseButton = new PIXI.Sprite(
      this.config.app.loader.resources[
        "booyah/images/button-mainmenu.png"
      ].texture
    );
    this.pauseButton.anchor.set(0.5);
    this.pauseButton.position.set(50);
    this.pauseButton.interactive = true;
    this._on(this.pauseButton, "pointertap", this._onPause);
    this.container.addChild(this.pauseButton);

    this.menuLayer = new PIXI.Container();
    this.menuLayer.visible = false;
    this.container.addChild(this.menuLayer);

    this.mask = new PIXI.Graphics();
    this.mask.beginFill(0x000000);
    this.mask.drawRect(
      0,
      0,
      this.config.app.screen.width,
      this.config.app.screen.height
    );
    this.mask.endFill();
    this.mask.alpha = 0.6;
    this.mask.interactive = true;
    this.menuLayer.addChild(this.mask);

    this.playButton = new PIXI.Sprite(
      this.config.app.loader.resources["booyah/images/button-close.png"].texture
    );
    this.playButton.anchor.set(0.5);
    this.playButton.position.set(50);
    this.playButton.interactive = true;
    this._on(this.playButton, "pointertap", this._onPlay);
    this.menuLayer.addChild(this.playButton);

    const menuLayerConfig = _.extend({}, this.config, {
      container: this.menuLayer
    });

    if (this.gameLogo) {
      const gameLogo = new PIXI.Sprite(
        this.config.app.loader.resources[this.gameLogo].texture
      );
      gameLogo.position.set(65, 130);
      this.menuLayer.addChild(gameLogo);
    }

    const pcLogo = new PIXI.Sprite(
      this.config.app.loader.resources[
        "booyah/images/a-playcurious-game.png"
      ].texture
    );
    pcLogo.anchor.set(0.5);
    pcLogo.position.set(160, 450);
    this.menuLayer.addChild(pcLogo);

    if (util.supportsFullscreen(document.getElementById("game-parent"))) {
      this.fullScreenButton = new entity.ToggleSwitch({
        onTexture: this.config.app.loader.resources[
          "booyah/images/fullscreen-on.png"
        ].texture,
        offTexture: this.config.app.loader.resources[
          "booyah/images/fullscreen-off.png"
        ].texture,
        isOn: false,
        position: new PIXI.Point(405, 130)
      });
      this._on(this.fullScreenButton, "change", this._onChangeFullScreen);
      this.fullScreenButton.setup(menuLayerConfig);
      this.addEntity(this.fullScreenButton);

      // TODO: use event listener to check if full screen was exited manually with ESC key
    } else {
      const fullScreenButton = new PIXI.Sprite(
        this.config.app.loader.resources[
          "booyah/images/fullscreen-disabled.png"
        ].texture
      );
      fullScreenButton.position.set(405, 130);
      this.menuLayer.addChild(fullScreenButton);
    }

    this.musicButton = new entity.ToggleSwitch({
      onTexture: this.config.app.loader.resources["booyah/images/music-on.png"]
        .texture,
      offTexture: this.config.app.loader.resources[
        "booyah/images/music-off.png"
      ].texture,
      isOn: !this.config.jukebox.muted,
      position: new PIXI.Point(405, 230)
    });
    this._on(this.musicButton, "change", this._onChangeMusicIsOn);
    this.musicButton.setup(menuLayerConfig);
    this.addEntity(this.musicButton);

    // TODO prevent being able to turn both subtitles and sound off

    this.fxButton = new entity.ToggleSwitch({
      onTexture: this.config.app.loader.resources["booyah/images/voices-on.png"]
        .texture,
      offTexture: this.config.app.loader.resources[
        "booyah/images/voices-off.png"
      ].texture,
      isOn: !this.config.narrator.muted,
      position: new PIXI.Point(630, 230)
    });
    this._on(this.fxButton, "change", this._onChangeFxIsOn);
    this.fxButton.setup(menuLayerConfig);
    this.addEntity(this.fxButton);

    this.subtitlesButton = new entity.ToggleSwitch({
      onTexture: this.config.app.loader.resources[
        "booyah/images/subtitles-on.png"
      ].texture,
      offTexture: this.config.app.loader.resources[
        "booyah/images/subtitles-off.png"
      ].texture,
      isOn: this.config.narrator.showSubtitles,
      position: new PIXI.Point(630, 130)
    });
    this._on(this.subtitlesButton, "change", this._onChangeShowSubtitles);
    this.subtitlesButton.setup(menuLayerConfig);
    this.addEntity(this.subtitlesButton);

    const creditLink = new PIXI.Text("Credits", {
      fontFamily: "Roboto Condensed",
      fontSize: 32,
      fill: "white",
      strokeThickness: 4
    });
    creditLink.anchor.set(0.5, 0.5);
    creditLink.position.set(this.config.app.renderer.width / 2 - 10, 492);
    creditLink.interactive = true;
    this._on(creditLink, "pointertap", this._showCredits);
    this.menuLayer.addChild(creditLink);

    // Reset button
    {
      this.resetButton = new PIXI.Sprite(
        this.config.app.loader.resources[
          "booyah/images/button-replay.png"
        ].texture
      );
      this.resetButton.scale.set(0.58); // From 102 to 60 px
      this.resetButton.anchor.set(0.5);
      this.resetButton.position.set(this.config.app.renderer.width - 50, 50);
      this.resetButton.interactive = true;
      this._on(this.resetButton, "pointertap", this._onReset);
      this.menuLayer.addChild(this.resetButton);

      this.resetConfirmLayer = new PIXI.Container();
      this.resetConfirmLayer.visible = false;
      this.menuLayer.addChild(this.resetConfirmLayer);

      this.resetMask = new PIXI.Graphics();
      this.resetMask.beginFill(0x000000);
      this.resetMask.drawRect(
        0,
        0,
        this.config.app.screen.width,
        this.config.app.screen.height
      );
      this.resetMask.endFill();
      this.resetMask.alpha = 0.8;
      this.resetMask.interactive = true;
      this.resetConfirmLayer.addChild(this.resetMask);

      this.confirmResetButton = new PIXI.Sprite(
        this.config.app.loader.resources[
          "booyah/images/button-replay.png"
        ].texture
      );
      this.confirmResetButton.anchor.set(0.5);
      this.confirmResetButton.position.set(
        this.config.app.renderer.width / 2,
        this.config.app.renderer.height / 2
      );
      this.confirmResetButton.interactive = true;
      this._on(this.confirmResetButton, "pointertap", this._onConfirmReset);
      this.resetConfirmLayer.addChild(this.confirmResetButton);

      const cancelResetButton = new PIXI.Sprite(
        this.config.app.loader.resources[
          "booyah/images/button-back.png"
        ].texture
      );
      cancelResetButton.anchor.set(0.5);
      cancelResetButton.position.set(50);
      cancelResetButton.interactive = true;
      this._on(cancelResetButton, "pointertap", this._onCancelReset);
      this.resetConfirmLayer.addChild(cancelResetButton);
    }

    this.config.container.addChild(this.container);
  }

  update(options) {
    super.update(options);

    if (this.creditsEntity) {
      if (this.creditsEntity.requestedTransition) {
        this.removeEntity(this.creditsEntity);
        this.creditsEntity = null;
      }
    }
  }

  teardown() {
    super.teardown();

    this.config.container.removeChild(this.container);
  }

  _onPause() {
    this.pauseButton.visible = false;
    this.menuLayer.visible = true;

    this.emit("pause");
  }

  _onPlay() {
    this.pauseButton.visible = true;
    this.menuLayer.visible = false;

    this.emit("play");
  }

  _onChangeFullScreen(turnOn) {
    if (turnOn) util.requestFullscreen(document.getElementById("game-parent"));
    else util.exitFullscreen();
  }

  _onChangeMusicIsOn(isOn) {
    this.config.jukebox.setMuted(!isOn);
  }

  _onChangeFxIsOn(isOn) {
    this.config.narrator.setMuted(!isOn);
  }

  _onChangeShowSubtitles(showSubtitles) {
    this.config.narrator.setShowSubtitles(showSubtitles);
  }

  _onReset() {
    this.resetConfirmLayer.visible = true;
  }

  _onCancelReset() {
    this.resetConfirmLayer.visible = false;
  }

  _onConfirmReset() {
    this.pauseButton.visible = true;
    this.menuLayer.visible = false;
    this.resetConfirmLayer.visible = false;

    this.emit("reset");
  }

  _showCredits() {
    this.creditsEntity = new CreditsEntity(this.credits);
    this.addEntity(this.creditsEntity);
  }
}

export class CreditsEntity extends entity.CompositeEntity {
  // @credits like { "Game Design": ["JC", "Jesse"], }
  constructor(credits) {
    super();

    this.credits = credits;
  }

  setup(config) {
    super.setup(config);

    this.container = new PIXI.Container();

    let rolesText = [];
    let peopleText = [];
    let didFirstLine = false;
    for (let role in this.credits) {
      if (didFirstLine) {
        rolesText += "\n";
        peopleText += "\n";
      } else {
        didFirstLine = true;
      }

      rolesText += role;

      for (let person of this.credits[role]) {
        rolesText += "\n";
        peopleText += person + "\n";
      }
    }

    const mask = new PIXI.Graphics();
    mask.beginFill(0x000000);
    mask.drawRect(
      0,
      0,
      this.config.app.screen.width,
      this.config.app.screen.height
    );
    mask.endFill();
    mask.alpha = 0.8;
    mask.interactive = true;
    this.container.addChild(mask);

    const closeButton = new PIXI.Sprite(
      this.config.app.loader.resources["booyah/images/button-back.png"].texture
    );
    closeButton.anchor.set(0.5);
    closeButton.position.set(50);
    closeButton.interactive = true;
    this._on(
      closeButton,
      "pointertap",
      () => (this.requestedTransition = true)
    );
    this.container.addChild(closeButton);

    const roles = new PIXI.Text(rolesText, {
      fontFamily: "Roboto Condensed",
      fontSize: 32,
      fill: "white",
      align: "right"
    });
    roles.anchor.set(1, 0.5);
    roles.position.set(
      this.config.app.renderer.width / 2 - 10,
      this.config.app.renderer.height / 2
    );
    this.container.addChild(roles);

    const people = new PIXI.Text(peopleText, {
      fontFamily: "Roboto Condensed",
      fontSize: 32,
      fill: "white",
      align: "left"
    });
    people.anchor.set(0, 0.5);
    people.position.set(
      this.config.app.renderer.width / 2 + 10,
      this.config.app.renderer.height / 2
    );
    this.container.addChild(people);

    this.config.container.addChild(this.container);
  }

  teardown() {
    this.config.container.removeChild(this.container);

    super.teardown();
  }
}

export class LoadingScene extends entity.CompositeEntity {
  constructor(preloader, splashScreen) {
    super();

    this.preloader = preloader;
    this.splashScreen = splashScreen;
  }

  setup(config) {
    super.setup(config);

    this.progress = 0;
    this.shouldUpdateProgress = true;

    this.container = new PIXI.Container();

    if (this.splashScreen) {
      this.container.addChild(
        new PIXI.Sprite(this.preloader.resources[this.splashScreen].texture)
      );
    }

    this.loadingContainer = new PIXI.Container();
    this.container.addChild(this.loadingContainer);

    this.loadingFill = new PIXI.Graphics();
    this.loadingFill.position.set(
      this.config.app.screen.width / 2 - 50,
      (this.config.app.screen.height * 3) / 4 - 50
    );
    this.loadingContainer.addChild(this.loadingFill);

    const loadingFillMask = new PIXI.Graphics();
    loadingFillMask.beginFill(0xffffff);
    loadingFillMask.drawCircle(0, 0, 50);
    loadingFillMask.endFill();
    loadingFillMask.position.set(
      this.config.app.screen.width / 2,
      (this.config.app.screen.height * 3) / 4
    );
    this.loadingContainer.addChild(loadingFillMask);

    this.loadingFill.mask = loadingFillMask;

    this.loadingCircle = new PIXI.Sprite(
      this.preloader.resources["booyah/images/loader-circle.png"].texture
    );
    this.loadingCircle.anchor.set(0.5);
    this.loadingCircle.position.set(
      this.config.app.screen.width / 2,
      (this.config.app.screen.height * 3) / 4
    );
    this.loadingContainer.addChild(this.loadingCircle);

    this.config.container.addChild(this.container);
  }

  update(options) {
    super.update(options);

    this.loadingCircle.rotation += LOADING_SCENE_SPIN_SPEED * options.timeScale;

    if (this.shouldUpdateProgress) {
      const height = this.progress * 100; // Because the graphic happens to be 100px tall

      this.loadingFill.clear();
      this.loadingFill.beginFill(0xffffff);
      this.loadingFill.drawRect(0, 100, 100, -height);
      this.loadingFill.endFill();

      this.shouldUpdateProgress = false;
    }
  }

  teardown() {
    this.config.container.removeChild(this.container);

    super.teardown();
  }

  updateProgress(fraction) {
    this.progress = fraction;
    this.shouldUpdateProgress = true;
  }
}

export class ReadyScene extends entity.CompositeEntity {
  constructor(splashScreen) {
    super();

    this.splashScreen = splashScreen;
  }

  setup(config) {
    super.setup(config);

    this.container = new PIXI.Container();

    if (this.splashScreen) {
      this.container.addChild(
        new PIXI.Sprite(
          this.config.preloader.resources[this.splashScreen].texture
        )
      );
    }

    const button = new PIXI.Sprite(
      this.config.app.loader.resources["booyah/images/button-play.png"].texture
    );
    button.anchor.set(0.5);
    button.position.set(
      this.config.app.screen.width / 2,
      (this.config.app.screen.height * 3) / 4
    );
    this._on(button, "pointertap", () => (this.requestedTransition = true));
    button.interactive = true;
    this.container.addChild(button);

    this.config.container.addChild(this.container);
  }

  teardown() {
    this.config.container.removeChild(this.container);

    super.teardown();
  }
}

export class DoneScene extends entity.CompositeEntity {
  constructor(splashScreen) {
    super();

    this.splashScreen = splashScreen;
  }

  setup(config) {
    super.setup(config);

    this.container = new PIXI.Container();

    if (this.splashScreen) {
      this.container.addChild(
        new PIXI.Sprite(
          this.config.preloader.resources[this.splashScreen].texture
        )
      );
    }

    const button = new PIXI.Sprite(
      this.config.app.loader.resources[
        "booyah/images/button-replay.png"
      ].texture
    );
    button.anchor.set(0.5);
    button.position.set(
      this.config.app.screen.width / 2,
      (this.config.app.screen.height * 3) / 4
    );
    this._on(button, "pointertap", () => (this.requestedTransition = true));
    button.interactive = true;
    this.container.addChild(button);

    this.config.container.addChild(this.container);
  }

  teardown() {
    this.config.container.removeChild(this.container);

    super.teardown();
  }
}

function updateLoadingProgress() {
  const progress =
    (pixiLoaderProgress + fontLoaderProgress + audioLoaderProgress) / 3;
  console.log("loading progress", progress, {
    pixiLoaderProgress,
    fontLoaderProgress,
    audioLoaderProgress
  });
  loadingScene.updateProgress(progress);
}

function pixiLoadProgressHandler(loader, resource) {
  pixiLoaderProgress = loader.progress / 100;
  updateLoadingProgress();
}

function update(timeScale) {
  const frameTime = Date.now();
  const timeSinceLastFrame = frameTime - lastFrameTime;
  lastFrameTime = frameTime;

  // Only count "play time" as compared to clock time
  if (gameState == "playing") {
    playTime += timeSinceLastFrame;
    timeSinceStart += timeSinceLastFrame;
  }

  const options = {
    playTime,
    timeSinceStart,
    timeSinceLastFrame,
    timeScale,
    gameState
  };

  if (previousGameState != gameState) {
    if (previousGameState == "playing" && gameState == "paused") {
      rootEntity.onSignal("pause");
    } else if (previousGameState == "paused" && gameState == "playing") {
      rootEntity.onSignal("play");
    }

    previousGameState = gameState;
  }

  rootEntity.update(options);

  app.renderer.render(app.stage);
}

function changeGameState(newGameState) {
  console.log("switching from game state", gameState, "to", newGameState);
  gameState = newGameState;

  ga("send", "event", "changeGameState", newGameState);
}

function processStartingOptions() {
  startingOptions.scene = booyahConfig.startingScene;

  const searchParams = new URLSearchParams(window.location.search);
  if (searchParams.has("mute")) startingOptions.mute = true;
  if (searchParams.has("mute-music")) startingOptions.muteMusic = true;
  if (searchParams.has("mute-fx")) startingOptions.muteFx = true;
  if (searchParams.has("no-subtitles")) startingOptions.noSubtitles = true;
  if (searchParams.has("scene"))
    startingOptions.scene = searchParams.get("scene");
  if (searchParams.has("params"))
    startingOptions.sceneParams = JSON.parse(searchParams.get("params"));

  if (startingOptions.mute) {
    Howler.volume(0);
  }
}

function loadB1() {
  changeGameState("loadingB");

  util.endTiming("loadA");
  util.startTiming("loadB");

  // Load graphical assets
  const pixiLoaderResources = [].concat(
    GRAPHICAL_ASSETS,
    booyahConfig.graphicalAssets,
    _.map(booyahConfig.videoAssets, name => {
      return {
        url: `video/${name}`,
        metadata: {
          loadElement: util.makeVideoElement()
        }
      };
    })
  );
  app.loader.add(pixiLoaderResources).on("progress", pixiLoadProgressHandler);

  const fonts = ["Roboto Condensed", ...booyahConfig.fontsAssets];
  const fontLoaderPromises = _.map(fonts, name => {
    return new FontFaceObserver(name).load(FONT_OBSERVER_CHARS).then(() => {
      fontLoaderProgress += 1 / fonts.length;
      updateLoadingProgress();
    });
  });

  const promises = _.flatten(
    [util.makePixiLoadPromise(app.loader), fontLoaderPromises],
    true
  );

  return Promise.all(promises).catch(err =>
    console.error("Error loading B1", err)
  );
}

function loadB2() {
  return narration
    .loadScript("fr")
    .then(script => {
      narrationTable = script;
      console.log("Loaded script", script);
    })
    .catch(err => console.error("Error loading B2", err));
}

function loadC() {
  util.endTiming("loadB");
  util.startTiming("loadC");

  // Load audio
  narrationAudio = narration.loadNarrationAudio(narrationTable, "fr");

  const narrationLoadPromises = Array.from(
    narrationAudio.values(),
    audio.makeHowlerLoadPromise
  );

  musicAudio = audio.makeHowls("music", booyahConfig.musicAssets);
  const musicLoadPromises = _.map(musicAudio, audio.makeHowlerLoadPromise);

  fxAudio = audio.makeHowls("fx", booyahConfig.fxAssets);
  const fxLoadPromises = _.map(fxAudio, audio.makeHowlerLoadPromise);

  const audioPromises = _.flatten(
    [narrationLoadPromises, musicLoadPromises, fxLoadPromises],
    true
  );
  _.each(audioPromises, p =>
    p.then(() => {
      audioLoaderProgress += 1 / audioPromises.length;
      updateLoadingProgress();
    })
  );

  return Promise.all(audioPromises).catch(err =>
    console.error("Error loading C", err)
  );
}

function doneLoading() {
  util.endTiming("loadC");
  util.startTiming("playing");

  changeGameState("playing");

  // Remove loading screen
  loadingScene.teardown();
  loadingScene = null;
  rootEntity = null;

  // The new rootEntity will contain all the sub entities
  rootEntity = new entity.ParallelEntity();

  // gameSequence will have the ready and done scenes
  gameSequence = new entity.EntitySequence(
    [
      new ReadyScene(booyahConfig.splashScreen),
      gameStateMachine,
      new DoneScene(booyahConfig.splashScreen)
    ],
    { loop: true }
  );

  // Filter out the pause event for the game sequence
  rootEntity.addEntity(
    new FilterPauseEntity([
      new entity.ContainerEntity([gameSequence], "gameSequence")
    ])
  );

  speakerDisplay = new narration.SpeakerDisplay(
    booyahConfig.speakers,
    booyahConfig.speakerPosition
  );
  rootEntity.addEntity(speakerDisplay);

  narrator = new narration.Narrator(narrationAudio, narrationTable, {
    muted: startingOptions.muteFx,
    showSubtitles: !startingOptions.noSubtitles
  });
  rootEntity.addEntity(narrator);

  jukebox = new audio.Jukebox(musicAudio, { muted: startingOptions.muteMusic });
  rootEntity.addEntity(jukebox);

  fxMachine = new audio.FxMachine(fxAudio, { muted: startingOptions.muteFx });
  rootEntity.addEntity(fxMachine);

  menuEntity = new MenuEntity(booyahConfig.credits, booyahConfig.gameLogo);
  menuEntity.on("pause", () => changeGameState("paused"));
  menuEntity.on("play", () => changeGameState("playing"));
  menuEntity.on("reset", () => {
    narrator.cancelAll();
    jukebox.changeMusic();
    changeGameState("playing");
    gameSequence.restart();
  });
  rootEntity.addEntity(menuEntity);

  const container = app.stage;

  const config = {
    booyahConfig,
    app,
    preloader,
    narrator,
    narrationTable,
    jukebox,
    fxMachine,
    container
  };

  rootEntity.setup(config);
}

export function makePreloader(additionalAssets) {
  const loader = new PIXI.Loader();
  loader.add(PRELOADER_ASSETS);
  loader.add(additionalAssets);
  return loader;
}

export function go(config = {}) {
  booyahConfig = _.defaults(config, DEFAULT_CONFIG);

  processStartingOptions();

  gameStateMachine = new entity.StateMachine(
    booyahConfig.states,
    booyahConfig.transitions,
    {
      startingState: startingOptions.scene,
      startingStateParams: startingOptions.sceneParams,
      endingState: booyahConfig.endingScene
    }
  );
  gameStateMachine.on("stateChange", onGameStateMachineChange);

  app = new PIXI.Application({
    width: config.screenSize.x,
    height: config.screenSize.y,
    view: document.getElementById(config.canvasId)
  });

  ga("send", "event", "loading", "start");
  util.startTiming("loadA");

  // Setup preloader
  preloader = makePreloader(
    _.compact([booyahConfig.splashScreen, booyahConfig.gameLogo])
  );

  const loadingPromise = Promise.all([
    util.makeDomContentLoadPromise(document),
    util.makePixiLoadPromise(preloader)
  ])
    .then(() => {
      // Show loading screen as soon as preloader is done
      loadingScene = new LoadingScene(preloader, booyahConfig.splashScreen);
      rootEntity = loadingScene;

      // The loading scene doesn't get the full config
      loadingScene.setup({
        app,
        container: app.stage
      });
      app.ticker.add(update);
    })
    .then(() => Promise.all([loadB1(), loadB2()]))
    .then(loadC)
    .then(doneLoading)
    .catch(err => console.error("Error during load", err));

  return { app, startingOptions, gameStateMachine, loadingPromise };
}

function onGameStateMachineChange(
  nextStateName,
  nextStateParams,
  previousStateName,
  previousStateParams
) {
  const url = new URL(window.location.href);
  url.searchParams.set("scene", nextStateName);
  url.searchParams.set("params", JSON.stringify(nextStateParams || {}));

  console.log("New game state:", nextStateName, nextStateParams);
  console.log("New game state link:", url.href);
}
