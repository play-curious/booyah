import * as util from "./util.js";
import * as entity from "./entity.js";
import * as audio from "./audio.js";

const DEFAULT_DIRECTIVES = {
  screenSize: new PIXI.Point(960, 540),
  canvasId: "pixi-canvas",
  states: [],
  transitions: {},
  startingScene: "start",
  startingSceneParams: {},
  startingProgress: {},
  endingScenes: ["end"],
  graphicalAssets: [],
  musicAssets: [],
  fxAssets: [],
  videoAssets: [],
  fontAssets: [],
  jsonAssets: [],
  speakers: {},
  speakerPosition: new PIXI.Point(50, 540),
  credits: {}, // @credits like { "Game Design": ["JC", "Jesse"], }
  creditsTextSize: 32,
  splashScreen: null,
  gameLogo: null,
  extraLogos: [],
  extraLoaders: [],
  entityInstallers: [],
  graphics: {
    menu: "booyah/images/button-mainmenu.png",
    skip: "booyah/images/button-skip.png",
    play: "booyah/images/button-play.png"
  }
};

const GRAPHICAL_ASSETS = [
  "booyah/images/a-playcurious-game.png",
  "booyah/images/button-back.png",
  "booyah/images/button-close.png",
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

const PRELOADER_ASSETS = [
  "booyah/images/loader-circle.png",
  "booyah/images/loader-error.png"
];
const LOADING_SCENE_SPIN_SPEED = Math.PI / 60; // One spin in 2s

const rootConfig = {};

let loadingScene;
let rootEntity;

let lastFrameTime = 0;

let previousGameState = null;
let gameState = "preloading"; // One of "preloading", "loadingFixed", "ready", "playing", "paused", "done"
let playTime = 0;
let timeSinceStart = 0;

let pixiLoaderProgress = 0;
let fontLoaderProgress = 0;
let fixedAudioLoaderProgress = 0;
let variableAudioLoaderProgress = 0;

// Only send updates on non-paused entties
class FilterPauseEntity extends entity.CompositeEntity {
  update(options) {
    if (options.gameState == "playing") super.update(options);
  }
}

class PlayOptions extends PIXI.utils.EventEmitter {
  constructor(directives, searchUrl) {
    super();

    this.options = {
      musicOn: true,
      fxOn: true,
      showSubtitles: true,
      sceneParams: {}
    };

    this.options.scene = directives.startingScene;
    this.options.sceneParams = directives.startingSceneParams;
    this.options.startingProgress = directives.startingProgress;

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
  }

  setOption(name, value) {
    this.options[name] = value;
    this.emit(name, value);
    this.emit("change", name, value);
  }

  getOption(name) {
    return this.options[name];
  }
}

export class MenuEntity extends entity.ParallelEntity {
  _setup(config) {
    this.container = new PIXI.Container();
    this.container.name = "menu";

    this.creditsEntity = null;

    this.pauseButton = new PIXI.Sprite(
      this.config.app.loader.resources[
        this.config.directives.graphics.menu
      ].texture
    );
    this.pauseButton.anchor.set(0.5);
    this.pauseButton.position.set(this.config.app.renderer.width - 50, 50);
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

    if (this.config.directives.gameLogo) {
      const gameLogo = new PIXI.Sprite(
        this.config.app.loader.resources[
          this.config.directives.gameLogo
        ].texture
      );
      gameLogo.position.set(65, 130);
      this.menuLayer.addChild(gameLogo);
    }

    const pcLogo = new PIXI.Sprite(
      this.config.app.loader.resources[
        "booyah/images/a-playcurious-game.png"
      ].texture
    );
    pcLogo.anchor.set(0.5, 1);
    pcLogo.position.set(160, 450);
    this.menuLayer.addChild(pcLogo);

    if (this.config.directives.extraLogos) {
      // Divide space, align to the right
      const spacePerLogo =
        (this.config.app.renderer.width - 160 * 2) /
        this.config.directives.extraLogos.length;
      for (let i = 0; i < this.config.directives.extraLogos.length; i++) {
        const logoSprite = new PIXI.Sprite(
          this.config.app.loader.resources[
            this.config.directives.extraLogos[i]
          ].texture
        );
        logoSprite.anchor.set(0.5, 1);
        logoSprite.position.set(
          this.config.app.renderer.width - 160 - spacePerLogo * i,
          420
        );
        this.menuLayer.addChild(logoSprite);
      }
    }

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
      isOn: this.config.playOptions.options.musicOn,
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
      isOn: this.config.playOptions.options.fxOn,
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
      isOn: this.config.playOptions.options.showSubtitles,
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

  _update(options) {
    if (this.creditsEntity) {
      if (this.creditsEntity.requestedTransition) {
        this.removeEntity(this.creditsEntity);
        this.creditsEntity = null;
      }
    }
  }

  _teardown() {
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
    this.config.playOptions.setOption("musicOn", isOn);
  }

  _onChangeFxIsOn(isOn) {
    this.config.playOptions.setOption("fxOn", isOn);
  }

  _onChangeShowSubtitles(showSubtitles) {
    this.config.playOptions.setOption("showSubtitles", showSubtitles);
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
    this.creditsEntity = new CreditsEntity();
    this.addEntity(this.creditsEntity);
  }
}

export function installMenu(rootConfig, rootEntity) {
  rootConfig.menu = new MenuEntity();
  rootEntity.addEntity(rootConfig.menu);
}

export class CreditsEntity extends entity.CompositeEntity {
  _setup(config) {
    this.container = new PIXI.Container();

    let rolesText = [];
    let peopleText = [];
    let didFirstLine = false;
    for (let role in this.config.directives.credits) {
      if (didFirstLine) {
        rolesText += "\n";
        peopleText += "\n";
      } else {
        didFirstLine = true;
      }

      rolesText += role;

      for (let person of this.config.directives.credits[role]) {
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
      fontSize: this.config.directives.creditsTextSize,
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
      fontSize: this.config.directives.creditsTextSize,
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

  _teardown() {
    this.config.container.removeChild(this.container);
  }
}

export class LoadingScene extends entity.CompositeEntity {
  setup(config) {
    super.setup(config);

    this.progress = 0;
    this.shouldUpdateProgress = true;

    this.container = new PIXI.Container();

    if (this.config.directives.splashScreen) {
      this.container.addChild(
        new PIXI.Sprite(
          this.config.preloader.resources[
            this.config.directives.splashScreen
          ].texture
        )
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
      this.config.preloader.resources["booyah/images/loader-circle.png"].texture
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
  setup(config) {
    super.setup(config);

    this.container = new PIXI.Container();

    if (this.config.directives.splashScreen) {
      this.container.addChild(
        new PIXI.Sprite(
          this.config.preloader.resources[
            this.config.directives.splashScreen
          ].texture
        )
      );
    }

    const button = new PIXI.Sprite(
      this.config.app.loader.resources[
        this.config.directives.graphics.play
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

export class LoadingErrorScene extends entity.ParallelEntity {
  _setup() {
    this.container = new PIXI.Container();

    if (this.config.directives.splashScreen) {
      this.container.addChild(
        new PIXI.Sprite(
          this.config.preloader.resources[
            this.config.directives.splashScreen
          ].texture
        )
      );
    }

    const button = new PIXI.Sprite(
      this.config.preloader.resources[
        "booyah/images/loader-error.png"
      ].texture
    );
    button.anchor.set(0.5);
    button.position.set(
      this.config.app.screen.width / 2,
      (this.config.app.screen.height * 3) / 4
    );
    this.container.addChild(button);

    this.config.container.addChild(this.container);
  }

  _teardown() {
    this.config.container.removeChild(this.container);
  }
}

export class DoneScene extends entity.CompositeEntity {
  setup(config) {
    super.setup(config);

    this.container = new PIXI.Container();

    if (this.config.directives.splashScreen) {
      this.container.addChild(
        new PIXI.Sprite(
          this.config.preloader.resources[
            this.config.directives.splashScreen
          ].texture
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
    (pixiLoaderProgress +
      fontLoaderProgress +
      fixedAudioLoaderProgress +
      variableAudioLoaderProgress) /
    4;
  console.debug("loading progress", progress, {
    pixiLoaderProgress,
    fontLoaderProgress,
    fixedAudioLoaderProgress,
    variableAudioLoaderProgress
  });

  if (loadingScene) loadingScene.updateProgress(progress);
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

  if (previousGameState !== gameState) {
    if (previousGameState == "playing" && gameState == "paused") {
      rootEntity.onSignal("pause");
    } else if (previousGameState == "paused" && gameState == "playing") {
      rootEntity.onSignal("play");
    }

    previousGameState = gameState;
  }

  rootEntity.update(options);

  rootConfig.app.renderer.render(rootConfig.app.stage);
}

function changeGameState(newGameState) {
  console.log("switching from game state", gameState, "to", newGameState);
  gameState = newGameState;

  ga("send", "event", "changeGameState", newGameState);
}

function loadFixedAssets() {
  changeGameState("loadingFixed");

  util.endTiming("preload");
  util.startTiming("loadFixed");

  // Load graphical assets
  const pixiLoaderResources = [].concat(
    GRAPHICAL_ASSETS,
    _.values(rootConfig.directives.graphics),
    rootConfig.directives.graphicalAssets,
    _.map(rootConfig.directives.videoAssets, name => {
      return {
        url: `video/${name}`,
        metadata: {
          loadElement: util.makeVideoElement()
        }
      };
    })
  );
  rootConfig.app.loader
    .add(pixiLoaderResources)
    .on("progress", pixiLoadProgressHandler);

  const fonts = ["Roboto Condensed", ...rootConfig.directives.fontAssets];
  const fontLoaderPromises = _.map(fonts, name => {
    return new FontFaceObserver(name)
      .load(FONT_OBSERVER_CHARS)
      .then(() => {
        fontLoaderProgress += 1 / fonts.length;
        updateLoadingProgress();
      })
      .catch(e => {
        console.error("Cannot load font", name);
        throw e;
      });
  });

  rootConfig.jsonAssets = {};
  const jsonLoaderPromises = _.map(
    rootConfig.directives.jsonAssets,
    filename => {
      return util.loadJson(filename).then(data => {
        rootConfig.jsonAssets[filename] = data;
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
  _.each(fixedAudioLoaderPromises, p =>
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
      jsonLoaderPromises
    ],
    true
  );

  return Promise.all(promises).catch(err => {
    console.error("Error loading fixed assets", err);
    throw err;
  });
}

function loadVariable() {
  util.endTiming("loadFixed");
  util.startTiming("loadVariable");

  const loadingPromises = [];
  for (const loader of rootConfig.directives.extraLoaders) {
    // TODO: handle progress
    const newPromise = loader(rootConfig);
    loadingPromises.push(newPromise);
  }

  return Promise.all(loadingPromises).catch(err => {
    console.error("Error in variable loading stage", err);
    throw err;
  });

  // // Load audio
  // narrationAudio = narration.loadNarrationAudio(narrationTable, "fr");

  // const narrationLoadPromises = Array.from(
  //   narrationAudio.values(),
  //   audio.makeHowlerLoadPromise
  // );

  // _.each(narrationLoadPromises, p =>
  //   p.then(() => {
  //     variableAudioLoaderProgress += 1 / narrationLoadPromises.length;
  //     updateLoadingProgress();
  //   })
  // );

  // return Promise.all(narrationLoadPromises).catch(err =>
  //   console.error("Error loading C", err)
  // );
}

function doneLoading() {
  util.endTiming("loadVariable");
  util.startTiming("playing");

  changeGameState("playing");

  // Remove loading screen
  loadingScene.teardown();
  loadingScene = null;
  rootEntity = null;

  // The new rootEntity will contain all the sub entities
  rootEntity = new entity.ParallelEntity();

  // gameSequence will have the ready and done scenes
  const gameSequence = new entity.EntitySequence(
    [new ReadyScene(), rootConfig.gameStateMachine, new DoneScene()],
    { loop: true }
  );

  // Filter out the pause event for the game sequence
  rootEntity.addEntity(
    new FilterPauseEntity([
      new entity.ContainerEntity([gameSequence], "gameSequence")
    ])
  );

  for (const installer of rootConfig.directives.entityInstallers) {
    installer(rootConfig, rootEntity);
  }

  if (rootConfig.menu) {
    rootConfig.menu.on("pause", () => changeGameState("paused"));
    rootConfig.menu.on("play", () => changeGameState("playing"));
    rootConfig.menu.on("reset", () => {
      rootEntity.onSignal("reset");
      changeGameState("playing");
    });
  }

  rootEntity.setup(rootConfig);
}

export function makePreloader(additionalAssets) {
  const loader = new PIXI.Loader();
  loader.add(PRELOADER_ASSETS);
  loader.add(additionalAssets);
  return loader;
}

export function go(directives = {}) {
  rootConfig.directives = util.deepDefaults(directives, DEFAULT_DIRECTIVES);

  // Process starting options
  rootConfig.playOptions = new PlayOptions(
    rootConfig.directives,
    window.location.search
  );

  rootConfig.gameStateMachine = new entity.StateMachine(
    rootConfig.directives.states,
    rootConfig.directives.transitions,
    {
      startingState: rootConfig.playOptions.options.scene,
      startingStateParams: rootConfig.playOptions.options.sceneParams,
      startingProgress: rootConfig.playOptions.options.startingProgress,
      endingStates: rootConfig.directives.endingScenes
    }
  );
  rootConfig.gameStateMachine.on("stateChange", onGameStateMachineChange);

  rootConfig.app = new PIXI.Application({
    width: rootConfig.directives.screenSize.x,
    height: rootConfig.directives.screenSize.y,
    view: document.getElementById(rootConfig.directives.canvasId)
  });
  rootConfig.container = rootConfig.app.stage;

  ga("send", "event", "loading", "start");
  util.startTiming("preload");

  // Setup preloader
  rootConfig.preloader = makePreloader(
    _.compact([
      rootConfig.directives.splashScreen,
      rootConfig.directives.gameLogo
    ])
  );

  const loadingPromise = Promise.all([
    util.makeDomContentLoadPromise(document),
    util.makePixiLoadPromise(rootConfig.preloader)
  ])
    .then(() => {
      // Show loading screen as soon as preloader is done
      loadingScene = new LoadingScene();
      rootEntity = loadingScene;

      // The loading scene doesn't get the full config
      loadingScene.setup(rootConfig);
      rootConfig.app.ticker.add(update);
    })
    .then(() => loadFixedAssets())
    .then(loadVariable)
    .then(doneLoading)
    .catch(err => {
      console.error("Error during load", err);

      // Replace loading scene with loading error
      loadingScene.teardown();
      loadingScene = null;

      rootEntity = new LoadingErrorScene();
      rootEntity.setup(rootConfig);

      throw err;
    });

  return {
    rootConfig,
    loadingPromise
  };
}

function onGameStateMachineChange(
  nextStateName,
  nextStateParams,
  previousStateName,
  previousStateParams
) {
  const url = new URL(window.location.href);
  nextStateParams = nextStateParams
    ? removePrivateProperties(nextStateParams)
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

function removePrivateProperties(obj) {
  const result = {};
  for (const key in obj) {
    if (!key.startsWith("_")) result[key] = obj;
  }
  return result;
}
