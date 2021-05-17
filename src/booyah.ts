import * as PIXI from "pixi.js";
import Stats from "stats.js";

// @ts-ignore
const FontFaceObserver = require("fontfaceobserver");

// TODO: Once the PR has been accepted, move back to the version from NPM
import preload from "./preload-it.esm";

import * as _ from "underscore";
import * as util from "./util";
import * as entity from "./entity";
import * as audio from "./audio";

export interface Directives {
  rootConfig: entity.EntityConfig;
  rootEntity: entity.Entity;
  loadingPromise: any;
  graphics: any;
  startingSceneParams: any;
  startingScene: any;
  startingProgress: any;
  gameLogo: string;
  extraLogos: string[];
  videoAssets: string[];
  supportedLanguages: string[];
  language: string;
  splashScreen: string;
  graphicalAssets: string[];
  fontAssets: string[];
  jsonAssets: { [k: string]: string };
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
  loadingGauge: {
    position: PIXI.IPointData;
    scale: number;
  };
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

  // For narration
  speakers: {},
  speakerPosition: new PIXI.Point(50, 540),

  // Appearance. These assets are automatically added to "graphicalAssets"
  splashScreen: null, // Splash screen should be the size of the game
  gameLogo: null, // Will be displayed in the menu
  extraLogos: [], // Logos besides Play Curious will be shown in the menu

  rootConfig: {}, // Initial value for the rootConfig
  extraLoaders: [], // Will be called after the fixed loading step. Of type function(rootConfig)
  entityInstallers: [], // Will be called when the game is initialized. Of type function(rootConfig, rootEntity)

  language: null,
  supportedLanguages: [], // If included, will show language switching buttons

  // Standard icons. They will be added to "graphicalAssets"
  graphics: {
    menu: "booyah/images/button-mainmenu.png",
    skip: "booyah/images/button-skip.png",
    play: "booyah/images/button-play.png",
  },

  fpsMeterPosition: "none",

  loadingGauge: {
    position: null,
    scale: 1,
  },
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
  "booyah/images/voices-on.png",
];

/** String of characters to look for in a font */
const FONT_OBSERVER_CHARS = "asdf";

const PRELOADER_ASSETS = [
  "booyah/images/loader-circle.png",
  "booyah/images/loader-error.png",
];
const LOADING_SCENE_SPIN_SPEED = Math.PI / 60; // One spin in 2s

const rootConfig: entity.EntityConfig = {
  directives: null,
  app: null,
  preloader: null,
  container: null,
  playOptions: null,
  musicAudio: {},
  videoAssets: {},
  jsonAssets: {},
  fxAudio: null,
  gameStateMachine: null,
  menu: null,
  muted: null,
  jukebox: null,
  narrator: null,
  world: null,
};

let loadingScene: LoadingScene;
let loadingErrorScene: LoadingErrorScene;
let gameEntity: entity.ParallelEntity;

function getRootEntity(): entity.Entity {
  return loadingScene || loadingErrorScene || gameEntity;
}

let lastFrameTime = 0;

let previousGameState: entity.GameState = null;
let gameState: entity.GameState = "preloading";
let playTime = 0;
let timeSinceStart = 0;

let pixiLoaderProgress = 0;
let fontLoaderProgress = 0;
let fixedAudioLoaderProgress = 0;
let videoLoaderProgress = 0;
let variableAudioLoaderProgress = 0;

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

export class MenuEntityOptions {
  menuButtonPosition: PIXI.Point = null;

  // @credits like { "Game Design": ["JC", "Jesse"], }
  credits: { [k: string]: string } = {};
  creditsTextSize = 32;
}

export class MenuEntity extends entity.CompositeEntity {
  public readonly options: MenuEntityOptions;

  public container: PIXI.Container;
  public menuLayer: PIXI.Container;
  public menuButtonLayer: PIXI.Container;
  public switchLanguageConfirmLayer: PIXI.Container;
  public resetConfirmLayer: PIXI.Container;
  public pauseButton: PIXI.Sprite;
  public playButton: PIXI.Sprite;
  public confirmLanguageButton: PIXI.Sprite;
  public resetButton: PIXI.Sprite;
  public confirmResetButton: PIXI.Sprite;
  public mask: PIXI.Graphics;
  public resetMask: PIXI.Graphics;
  public creditsEntity: CreditsEntity;
  public fullScreenButton: entity.ToggleSwitch;
  public musicButton: entity.ToggleSwitch;
  public fxButton: entity.ToggleSwitch;
  public subtitlesButton: entity.ToggleSwitch;

  constructor(options?: Partial<MenuEntityOptions>) {
    super();

    this.options = util.fillInOptions(options, new MenuEntityOptions());
  }

  _setup() {
    this.container = new PIXI.Container();
    this.container.name = "menu";

    this.creditsEntity = null;

    this.pauseButton = new PIXI.Sprite(
      this._entityConfig.app.loader.resources[
        this._entityConfig.directives.graphics.menu
      ].texture
    );
    this.pauseButton.anchor.set(0.5);
    this.pauseButton.position.copyFrom(
      this.options.menuButtonPosition ??
        new PIXI.Point(this._entityConfig.app.renderer.width - 50, 50)
    );
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
      this._entityConfig.app.screen.width,
      this._entityConfig.app.screen.height
    );
    this.mask.endFill();
    this.mask.alpha = 0.8;
    this.mask.interactive = true;
    this.menuLayer.addChild(this.mask);

    this.menuButtonLayer = new PIXI.Container();
    this.menuLayer.addChild(this.menuButtonLayer);

    this.playButton = new PIXI.Sprite(
      this._entityConfig.app.loader.resources[
        "booyah/images/button-close.png"
      ].texture
    );
    this.playButton.anchor.set(0.5);
    this.playButton.position.set(
      this._entityConfig.app.renderer.width - 50,
      50
    );
    this.playButton.interactive = true;
    this._on(this.playButton, "pointertap", this._onPlay);
    this.menuButtonLayer.addChild(this.playButton);

    const menuButtonLayerConfig = _.extend({}, this._entityConfig, {
      container: this.menuButtonLayer,
    });

    if (this._entityConfig.directives.gameLogo) {
      const gameLogo = new PIXI.Sprite(
        this._entityConfig.preloader.resources[
          this._entityConfig.directives.gameLogo
        ].texture
      );
      gameLogo.position.set(170, 200);
      gameLogo.anchor.set(0.5, 0.5);
      this.menuButtonLayer.addChild(gameLogo);
    }

    const pcLogo = new PIXI.Sprite(
      this._entityConfig.app.loader.resources[
        "booyah/images/a-playcurious-game.png"
      ].texture
    );
    pcLogo.anchor.set(0.5, 1);
    pcLogo.position.set(170, 450);
    this.menuButtonLayer.addChild(pcLogo);

    if (this._entityConfig.directives.extraLogos) {
      // Divide space, align to the right
      const spacePerLogo =
        (this._entityConfig.app.renderer.width - 160 * 2) /
        this._entityConfig.directives.extraLogos.length;
      for (
        let i = 0;
        i < this._entityConfig.directives.extraLogos.length;
        i++
      ) {
        const logoSprite = new PIXI.Sprite(
          this._entityConfig.app.loader.resources[
            this._entityConfig.directives.extraLogos[i]
          ].texture
        );
        logoSprite.anchor.set(0.5, 1);
        logoSprite.position.set(
          this._entityConfig.app.renderer.width - 160 - spacePerLogo * i,
          420
        );
        this.menuButtonLayer.addChild(logoSprite);
      }
    }

    if (util.supportsFullscreen()) {
      this.fullScreenButton = new entity.ToggleSwitch({
        onTexture: this._entityConfig.app.loader.resources[
          "booyah/images/fullscreen-on.png"
        ].texture,
        offTexture: this._entityConfig.app.loader.resources[
          "booyah/images/fullscreen-off.png"
        ].texture,
        isOn: false,
        position: new PIXI.Point(405, 130),
      });
      this._on(
        this.fullScreenButton,
        "change",
        this._onChangeFullScreen as any
      );
      this._activateChildEntity(this.fullScreenButton, menuButtonLayerConfig);

      // TODO: use event listener to check if full screen was exited manually with ESC key
    } else {
      const fullScreenButton = new PIXI.Sprite(
        this._entityConfig.app.loader.resources[
          "booyah/images/fullscreen-disabled.png"
        ].texture
      );
      fullScreenButton.position.set(405, 130);
      this.menuButtonLayer.addChild(fullScreenButton);
    }

    this.musicButton = new entity.ToggleSwitch({
      onTexture: this._entityConfig.app.loader.resources[
        "booyah/images/music-on.png"
      ].texture,
      offTexture: this._entityConfig.app.loader.resources[
        "booyah/images/music-off.png"
      ].texture,
      isOn: this._entityConfig.playOptions.options.musicOn,
      position: new PIXI.Point(405, 230),
    });
    this._on(this.musicButton, "change", this._onChangeMusicIsOn as any);
    this._activateChildEntity(this.musicButton, menuButtonLayerConfig);

    // TODO prevent being able to turn both subtitles and sound off

    this.fxButton = new entity.ToggleSwitch({
      onTexture: this._entityConfig.app.loader.resources[
        "booyah/images/voices-on.png"
      ].texture,
      offTexture: this._entityConfig.app.loader.resources[
        "booyah/images/voices-off.png"
      ].texture,
      isOn: this._entityConfig.playOptions.options.fxOn,
      position: new PIXI.Point(630, 230),
    });
    this._on(this.fxButton, "change", this._onChangeFxIsOn as any);
    this._activateChildEntity(this.fxButton, menuButtonLayerConfig);

    this.subtitlesButton = new entity.ToggleSwitch({
      onTexture: this._entityConfig.app.loader.resources[
        "booyah/images/subtitles-on.png"
      ].texture,
      offTexture: this._entityConfig.app.loader.resources[
        "booyah/images/subtitles-off.png"
      ].texture,
      isOn: this._entityConfig.playOptions.options.showSubtitles,
      position: new PIXI.Point(630, 130),
    });
    this._on(
      this.subtitlesButton,
      "change",
      this._onChangeShowSubtitles as any
    );
    this._activateChildEntity(this.subtitlesButton, menuButtonLayerConfig);

    const creditLink = new PIXI.Text("Credits", {
      fontFamily: "Roboto Condensed",
      fontSize: 32,
      fill: "white",
      strokeThickness: 4,
    });
    creditLink.anchor.set(0.5, 0.5);
    creditLink.position.set(
      this._entityConfig.app.renderer.width / 2 - 10,
      492
    );
    creditLink.interactive = true;
    this._on(creditLink, "pointertap", this._showCredits);
    this.menuButtonLayer.addChild(creditLink);

    // Language switching buttons
    if (this._entityConfig.directives.supportedLanguages) {
      for (
        let i = 0;
        i < this._entityConfig.directives.supportedLanguages.length;
        i++
      ) {
        const language = this._entityConfig.directives.supportedLanguages[i];
        const isSelected = language === this._entityConfig.directives.language;
        const sprite = new PIXI.Sprite(
          this._entityConfig.app.loader.resources[
            `booyah/images/lang-${language}-${isSelected ? "off" : "on"}.png`
          ].texture
        );
        sprite.position.set(405 + i * 100, 330);

        if (!isSelected) {
          sprite.interactive = true;
          this._on(sprite, "pointertap", () =>
            this._onSwitchLanguage(language)
          );
        }

        this.menuButtonLayer.addChild(sprite);
      }

      this.switchLanguageConfirmLayer = new PIXI.Container();
      this.switchLanguageConfirmLayer.visible = false;
      this.menuLayer.addChild(this.switchLanguageConfirmLayer);

      const mask = new PIXI.Graphics();
      mask.beginFill(0x000000);
      mask.drawRect(
        0,
        0,
        this._entityConfig.app.screen.width,
        this._entityConfig.app.screen.height
      );
      mask.endFill();
      mask.alpha = 0.8;
      mask.interactive = true;
      this.switchLanguageConfirmLayer.addChild(mask);

      this.confirmLanguageButton = new PIXI.Sprite();
      this.confirmLanguageButton.anchor.set(0.5);
      this.confirmLanguageButton.scale.set(1.5);
      this.confirmLanguageButton.position.set(
        this._entityConfig.app.renderer.width / 2,
        this._entityConfig.app.renderer.height / 2
      );
      this.confirmLanguageButton.interactive = true;
      // Event handler is added later, in _onSwitchLanguage()
      this.switchLanguageConfirmLayer.addChild(this.confirmLanguageButton);

      const cancelSwitchLanguageButton = new PIXI.Sprite(
        this._entityConfig.app.loader.resources[
          "booyah/images/button-back.png"
        ].texture
      );
      cancelSwitchLanguageButton.anchor.set(0.5);
      cancelSwitchLanguageButton.position.set(50);
      cancelSwitchLanguageButton.interactive = true;
      this._on(
        cancelSwitchLanguageButton,
        "pointertap",
        this._onCancelSwitchLanguage
      );
      this.switchLanguageConfirmLayer.addChild(cancelSwitchLanguageButton);
    }

    // Restart button
    {
      this.resetButton = new PIXI.Sprite(
        this._entityConfig.app.loader.resources[
          "booyah/images/button-replay.png"
        ].texture
      );
      this.resetButton.scale.set(0.58); // From 102 to 60 px
      this.resetButton.anchor.set(0.5);
      this.resetButton.position.set(50, 50);
      this.resetButton.interactive = true;
      this._on(this.resetButton, "pointertap", this._onReset);
      this.menuButtonLayer.addChild(this.resetButton);

      this.resetConfirmLayer = new PIXI.Container();
      this.resetConfirmLayer.visible = false;
      this.menuLayer.addChild(this.resetConfirmLayer);

      this.resetMask = new PIXI.Graphics();
      this.resetMask.beginFill(0x000000);
      this.resetMask.drawRect(
        0,
        0,
        this._entityConfig.app.screen.width,
        this._entityConfig.app.screen.height
      );
      this.resetMask.endFill();
      this.resetMask.alpha = 0.8;
      this.resetMask.interactive = true;
      this.resetConfirmLayer.addChild(this.resetMask);

      this.confirmResetButton = new PIXI.Sprite(
        this._entityConfig.app.loader.resources[
          "booyah/images/button-replay.png"
        ].texture
      );
      this.confirmResetButton.anchor.set(0.5);
      this.confirmResetButton.position.set(
        this._entityConfig.app.renderer.width / 2,
        this._entityConfig.app.renderer.height / 2
      );
      this.confirmResetButton.interactive = true;
      this._on(this.confirmResetButton, "pointertap", this._onConfirmReset);
      this.resetConfirmLayer.addChild(this.confirmResetButton);

      const cancelResetButton = new PIXI.Sprite(
        this._entityConfig.app.loader.resources[
          "booyah/images/button-back.png"
        ].texture
      );
      cancelResetButton.anchor.set(0.5);
      cancelResetButton.position.set(50);
      cancelResetButton.interactive = true;
      this._on(cancelResetButton, "pointertap", this._onCancelReset);
      this.resetConfirmLayer.addChild(cancelResetButton);
    }

    this._entityConfig.container.addChild(this.container);
  }

  _update(frameInfo: entity.FrameInfo) {
    if (this.creditsEntity) {
      if (this.creditsEntity.transition) {
        this._deactivateChildEntity(this.creditsEntity);
        this.creditsEntity = null;
      }
    }
  }

  _teardown() {
    this._entityConfig.container.removeChild(this.container);
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

  _onChangeFullScreen(turnOn?: boolean) {
    if (turnOn) util.requestFullscreen(document.getElementById("game-parent"));
    else util.exitFullscreen();
  }

  _onChangeMusicIsOn(isOn: boolean) {
    this._entityConfig.playOptions.setOption("musicOn", isOn);
  }

  _onChangeFxIsOn(isOn: boolean) {
    this._entityConfig.playOptions.setOption("fxOn", isOn);
  }

  _onChangeShowSubtitles(showSubtitles: boolean) {
    this._entityConfig.playOptions.setOption("showSubtitles", showSubtitles);
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
    this.creditsEntity = new CreditsEntity(this.options);
    this._activateChildEntity(this.creditsEntity);
  }

  _onSwitchLanguage(language: string) {
    this.confirmLanguageButton.texture = this._entityConfig.app.loader.resources[
      `booyah/images/lang-${language}-on.png`
    ].texture;
    this._on(this.confirmLanguageButton, "pointertap", () =>
      this._onConfirmSwitchLanguage(language)
    );
    this.switchLanguageConfirmLayer.visible = true;
  }

  _onConfirmSwitchLanguage(language: string) {
    // Make URL with a different language
    // IDEA: use the current progress of the game, from the game state machine?
    const url = new URL(window.location.href);
    url.searchParams.set("lang", language);
    //@ts-ignore
    window.location = url;
  }

  _onCancelSwitchLanguage() {
    this._off(this.confirmLanguageButton, "pointertap");
    this.switchLanguageConfirmLayer.visible = false;
  }
}

export function makeInstallMenu(options?: Partial<MenuEntityOptions>) {
  return (rootConfig: any, rootEntity: any) => {
    rootConfig.menu = new MenuEntity(options);
    rootEntity.addChildEntity(rootConfig.menu);
  };
}

export function installMenu(rootConfig: any, rootEntity: any) {
  rootConfig.menu = new MenuEntity();
  rootEntity.addChildEntity(rootConfig.menu);
}

export class CreditsEntity extends entity.CompositeEntity {
  public container: PIXI.Container;
  public mask: PIXI.Graphics;

  constructor(public readonly options: MenuEntityOptions) {
    super();
  }

  _setup(entityConfig: any) {
    this.container = new PIXI.Container();

    let rolesText = "";
    let peopleText = "";
    let didFirstLine = false;
    for (let role in this.options.credits) {
      if (didFirstLine) {
        rolesText += "\n";
        peopleText += "\n";
      } else {
        didFirstLine = true;
      }

      rolesText += role;

      // Their could be one person credited (string), or an array
      const people = _.isArray(this._entityConfig.options.credits[role])
        ? this._entityConfig.options.credits[role]
        : [this._entityConfig.options.credits[role]];
      for (let person of people) {
        rolesText += "\n";
        peopleText += person + "\n";
      }
    }

    const mask = new PIXI.Graphics();
    mask.beginFill(0x000000);
    mask.drawRect(
      0,
      0,
      this._entityConfig.app.screen.width,
      this._entityConfig.app.screen.height
    );
    mask.endFill();
    mask.alpha = 0.8;
    mask.interactive = true;
    this.container.addChild(mask);

    const closeButton = new PIXI.Sprite(
      this._entityConfig.app.loader.resources[
        "booyah/images/button-back.png"
      ].texture
    );
    closeButton.anchor.set(0.5);
    closeButton.position.set(50);
    closeButton.interactive = true;
    this._on(
      closeButton,
      "pointertap",
      () => (this._transition = entity.makeTransition())
    );
    this.container.addChild(closeButton);

    const roles = new PIXI.Text(rolesText, {
      fontFamily: "Roboto Condensed",
      fontSize: this.options.creditsTextSize,
      fill: "white",
      align: "right",
    });
    roles.anchor.set(1, 0.5);
    roles.position.set(
      this._entityConfig.app.renderer.width / 2 - 10,
      this._entityConfig.app.renderer.height / 2
    );
    this.container.addChild(roles);

    const people = new PIXI.Text(peopleText, {
      fontFamily: "Roboto Condensed",
      fontSize: this.options.creditsTextSize,
      fill: "white",
      align: "left",
    });
    people.anchor.set(0, 0.5);
    people.position.set(
      this._entityConfig.app.renderer.width / 2 + 10,
      this._entityConfig.app.renderer.height / 2
    );
    this.container.addChild(people);

    this._entityConfig.container.addChild(this.container);
  }

  _teardown() {
    this._entityConfig.container.removeChild(this.container);
  }
}

export class LoadingScene extends entity.EntityBase {
  progress: number;
  shouldUpdateProgress: boolean;
  container: PIXI.Container;
  loadingContainer: PIXI.Container;
  loadingFill: PIXI.Graphics;
  loadingCircle: PIXI.Sprite;

  _setup() {
    this.progress = 0;
    this.shouldUpdateProgress = true;

    this.container = new PIXI.Container();

    if (this._entityConfig.directives.splashScreen) {
      this.container.addChild(
        new PIXI.Sprite(
          this._entityConfig.preloader.resources[
            this._entityConfig.directives.splashScreen
          ].texture
        )
      );
    }

    this.loadingContainer = new PIXI.Container();
    this.container.addChild(this.loadingContainer);

    this.loadingFill = new PIXI.Graphics();
    this.loadingContainer.addChild(this.loadingFill);

    const loadingFillMask = new PIXI.Graphics();
    loadingFillMask.beginFill(0xffffff);
    loadingFillMask.drawCircle(
      0,
      0,
      50 * this._entityConfig.directives.loadingGauge.scale
    );
    loadingFillMask.endFill();
    loadingFillMask.position.copyFrom(
      this._entityConfig.directives.loadingGauge.position
    );
    this.loadingContainer.addChild(loadingFillMask);

    this.loadingFill.mask = loadingFillMask;

    this.loadingCircle = new PIXI.Sprite(
      this._entityConfig.preloader.resources[
        "booyah/images/loader-circle.png"
      ].texture
    );
    this.loadingCircle.anchor.set(0.5);
    this.loadingCircle.scale.set(
      this._entityConfig.directives.loadingGauge.scale
    );
    this.loadingCircle.position.copyFrom(
      this._entityConfig.directives.loadingGauge.position
    );
    this.loadingContainer.addChild(this.loadingCircle);

    this._entityConfig.container.addChild(this.container);
  }

  _update() {
    this.loadingCircle.rotation +=
      LOADING_SCENE_SPIN_SPEED * this._lastFrameInfo.timeScale;

    if (this.shouldUpdateProgress) {
      const height = this.progress * 100; // Because the graphic happens to be 100px tall

      this.loadingFill.clear();
      this.loadingFill.beginFill(0xffffff);
      this.loadingFill.drawRect(0, 100, 100, -height);
      this.loadingFill.endFill();

      this.shouldUpdateProgress = false;
    }
  }

  _teardown(frameInfo: entity.FrameInfo) {
    this._entityConfig.container.removeChild(this.container);
  }

  updateProgress(fraction: number) {
    this.progress = fraction;
    this.shouldUpdateProgress = true;
  }
}

export class ReadyScene extends entity.EntityBase {
  container: PIXI.Container;

  _setup() {
    this.container = new PIXI.Container();

    if (this._entityConfig.directives.splashScreen) {
      this.container.addChild(
        new PIXI.Sprite(
          this._entityConfig.preloader.resources[
            this._entityConfig.directives.splashScreen
          ].texture
        )
      );
    }

    const button = new PIXI.Sprite(
      this._entityConfig.app.loader.resources[
        this._entityConfig.directives.graphics.play
      ].texture
    );
    button.anchor.set(0.5);
    button.scale.set(this._entityConfig.directives.loadingGauge.scale);
    button.position.copyFrom(
      this._entityConfig.directives.loadingGauge.position
    );
    this._on(
      button,
      "pointertap",
      () => (this._transition = entity.makeTransition())
    );
    button.interactive = true;
    this.container.addChild(button);

    this._entityConfig.container.addChild(this.container);
  }

  _teardown() {
    this._entityConfig.container.removeChild(this.container);
  }
}

export class LoadingErrorScene extends entity.EntityBase {
  container: PIXI.Container;

  _setup() {
    this.container = new PIXI.Container();

    if (this._entityConfig.directives.splashScreen) {
      this.container.addChild(
        new PIXI.Sprite(
          this._entityConfig.preloader.resources[
            this._entityConfig.directives.splashScreen
          ].texture
        )
      );
    }

    const button = new PIXI.Sprite(
      this._entityConfig.preloader.resources[
        "booyah/images/loader-error.png"
      ].texture
    );
    button.anchor.set(0.5);
    button.scale.set(this._entityConfig.directives.loadingGauge.scale);
    button.position.copyFrom(
      this._entityConfig.directives.loadingGauge.position
    );
    this.container.addChild(button);

    this._entityConfig.container.addChild(this.container);
  }

  _teardown() {
    this._entityConfig.container.removeChild(this.container);
  }
}

export class DoneScene extends entity.EntityBase {
  container: PIXI.Container;

  _setup() {
    this.container = new PIXI.Container();

    if (this._entityConfig.directives.splashScreen) {
      this.container.addChild(
        new PIXI.Sprite(
          this._entityConfig.preloader.resources[
            this._entityConfig.directives.splashScreen
          ].texture
        )
      );
    }

    const button = new PIXI.Sprite(
      this._entityConfig.app.loader.resources[
        "booyah/images/button-replay.png"
      ].texture
    );
    button.anchor.set(0.5);
    button.position.copyFrom(this._entityConfig.directives.loader.position);
    this._on(
      button,
      "pointertap",
      () => (this._transition = entity.makeTransition())
    );
    button.interactive = true;
    this.container.addChild(button);

    this._entityConfig.container.addChild(this.container);
  }

  _teardown() {
    this._entityConfig.container.removeChild(this.container);
  }
}

function updateLoadingProgress() {
  const progress =
    (pixiLoaderProgress +
      fontLoaderProgress +
      fixedAudioLoaderProgress +
      variableAudioLoaderProgress +
      videoLoaderProgress) /
    5;
  // console.debug("loading progress", progress, {
  //   pixiLoaderProgress,
  //   fontLoaderProgress,
  //   fixedAudioLoaderProgress,
  //   variableAudioLoaderProgress,
  //   videoLoaderProgress,
  // });

  if (loadingScene) loadingScene.updateProgress(progress);
}

function pixiLoadProgressHandler(loader: any, resource?: any): void {
  pixiLoaderProgress = loader.progress / 100;
  updateLoadingProgress();
}

function update(timeScale: number) {
  const frameTime = Date.now();
  const timeSinceLastFrame = frameTime - lastFrameTime;
  lastFrameTime = frameTime;

  // Only count "play time" as compared to clock time
  if (gameState == "playing") {
    playTime += timeSinceLastFrame;
    timeSinceStart += timeSinceLastFrame;
  }

  const frameInfo: entity.FrameInfo = {
    playTime,
    timeSinceStart,
    timeSinceLastFrame,
    timeScale,
    gameState,
  };

  if (previousGameState !== gameState) {
    if (previousGameState == "playing" && gameState == "paused") {
      getRootEntity().onSignal(frameInfo, "pause");
    } else if (previousGameState == "paused" && gameState == "playing") {
      getRootEntity().onSignal(frameInfo, "play");
    }

    previousGameState = gameState;
  }

  getRootEntity().update(frameInfo);

  rootConfig.app.renderer.render(rootConfig.app.stage);
}

export function changeGameState(newGameState: entity.GameState) {
  console.log("switching from game state", gameState, "to", newGameState);
  gameState = newGameState;

  util.sendMetrics("send", "event", "changeGameState", newGameState);
}

function loadFixedAssets() {
  changeGameState("loadingFixed");

  util.endTiming("preload");
  util.startTiming("loadFixed");

  // Load graphical assets
  const pixiLoaderResources = [].concat(
    GRAPHICAL_ASSETS,
    _.values(rootConfig.directives.graphics),
    rootConfig.directives.graphicalAssets
  );
  rootConfig.app.loader.add(pixiLoaderResources);
  rootConfig.app.loader.onProgress.add(pixiLoadProgressHandler);

  const fonts = ["Roboto Condensed", ...rootConfig.directives.fontAssets];
  const fontLoaderPromises = _.map(fonts, (name) => {
    return new FontFaceObserver(name)
      .load(FONT_OBSERVER_CHARS)
      .then(() => {
        fontLoaderProgress += 1 / fonts.length;
        updateLoadingProgress();
      })
      .catch((e: any) => {
        console.warn("Cannot load font", name);

        // On Firefox, this will randomly timeout although font was loaded correctly
        // throw e;
      });
  });

  rootConfig.jsonAssets = {};
  const jsonLoaderPromises = _.map(
    rootConfig.directives.jsonAssets,
    (jsonAssetDescription: any) => {
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

  // Load video
  const videoLoaderPromises = [];
  if (rootConfig.directives.videoAssets.length > 0) {
    const videoLoader = preload();
    videoLoader.onprogress = (event: any) => {
      videoLoaderProgress = event.progress / 100;
      updateLoadingProgress();
    };
    videoLoaderPromises.push(
      videoLoader
        .fetch(
          rootConfig.directives.videoAssets.map(
            (name: string) => `video/${name}`
          )
        )
        .then((assets: any[]) => {
          const videoAssets: any = {};
          for (const asset of assets) {
            const element = util.makeVideoElement();
            element.src = asset.blobUrl;
            videoAssets[asset.url] = element;
          }
          rootConfig.videoAssets = videoAssets;
        })
        .catch((e) => {
          console.error("Cannot load videos", e);
          throw e;
        })
    );
  }

  const promises = _.flatten(
    [
      util.makePixiLoadPromise(rootConfig.app.loader),
      fontLoaderPromises,
      fixedAudioLoaderPromises,
      jsonLoaderPromises,
      videoLoaderPromises,
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
  const frameInfo: entity.FrameInfo = {
    playTime: 0,
    timeSinceStart: 0,
    timeSinceLastFrame: 0,
    timeScale: 1,
    gameState,
  };

  util.endTiming("loadVariable");
  util.startTiming("playing");

  changeGameState("playing");

  // Remove loading screen
  loadingScene.teardown(frameInfo);
  loadingScene = null;

  // The new rootEntity will contain all the sub entities
  gameEntity = new entity.ParallelEntity();

  // gameSequence will have the ready and done scenes
  const gameSequence = new entity.EntitySequence(
    [new ReadyScene(), rootConfig.gameStateMachine, new DoneScene()],
    { loop: true }
  );

  // Filter out the pause event for the game sequence
  gameEntity.addChildEntity(
    new FilterPauseEntity([
      new entity.ContainerEntity([gameSequence], "gameSequence"),
    ])
  );

  for (const installer of rootConfig.directives.entityInstallers) {
    installer(rootConfig, gameEntity);
  }

  if (rootConfig.menu) {
    rootConfig.menu.on("pause", () => changeGameState("paused"));
    rootConfig.menu.on("play", () => changeGameState("playing"));
    rootConfig.menu.on("reset", () => {
      gameEntity.onSignal(rootConfig.menu.lastFrameInfo, "reset");
      changeGameState("playing");
    });
  }

  gameEntity.setup(frameInfo, rootConfig);
}

export function makePreloader(additionalAssets: string[]) {
  const loader = new PIXI.Loader();
  loader.add(PRELOADER_ASSETS);
  loader.add(additionalAssets);
  return loader;
}

function setDefaultDirectives(directives: Partial<Directives>) {
  rootConfig.directives = util.deepDefaults(directives, DEFAULT_DIRECTIVES);

  // Set the loading gauge position from either the directives or default
  if (!rootConfig.directives.loadingGauge.position) {
    rootConfig.directives.loadingGauge.position = new PIXI.Point(
      rootConfig.directives.screenSize.x / 2 - 50,
      (rootConfig.directives.screenSize.y * 3) / 4 - 50
    );
  }
}

export function go(directives: Partial<Directives> = {}) {
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
  rootConfig.container = rootConfig.app.stage;

  // Optionally show fps meter
  if (rootConfig.playOptions.options.fpsMeterPosition !== "none")
    showFpsMeter(rootConfig.playOptions.options.fpsMeterPosition);

  util.sendMetrics("send", "event", "loading", "start");
  util.startTiming("preload");

  // Setup preloader
  rootConfig.preloader = makePreloader(
    _.compact([
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
      loadingScene = new LoadingScene();

      // The loading scene doesn't get the full entityConfig
      loadingScene.setup(frameInfo, rootConfig);

      rootConfig.app.ticker.add(update);

      if (rootConfig.playOptions.options.fpsMeterPosition !== "none")
        rootConfig.app.ticker.add(updateFpsMeter);
    })
    .then(() => loadFixedAssets())
    .then(loadVariable)
    .then(doneLoading)
    .catch((err) => {
      console.error("Error during load", err);

      // Replace loading scene with loading error
      loadingScene.teardown(frameInfo);
      loadingScene = null;

      loadingErrorScene = new LoadingErrorScene();
      getRootEntity().setup(frameInfo, rootConfig);

      throw err;
    });

  return {
    rootConfig,
    rootEntity: getRootEntity(),
    loadingPromise,
  };
}

function onGameStateMachineChange(
  nextStateName: string,
  nextStateParams: any,
  previousStateName: string,
  previousStateParams: any
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

function removePrivateProperties(obj: any) {
  const result: any = {};
  for (const key in obj) {
    if (!key.startsWith("_")) result[key] = obj[key];
  }
  return result;
}
