import * as PIXI from "pixi.js";
import Stats from "stats.js";

// @ts-ignore
const FontFaceObserver = require("fontfaceobserver");

// TODO: Once the PR has been accepted, move back to the version from NPM
import preload from "./preload-it.esm";

import * as _ from "underscore";
import * as util from "./util";
import * as chip from "./chip";
import * as audio from "./audio";

export interface Directives {
  rootConfig: chip.ChipConfig;
  rootChip: chip.Chip;
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
  jsonAssets: Array<string | { key: string; url: string }>;
  subtitleAssets: Array<string>;
  musicAssets: (string | { key: string; url: string })[];
  fxAssets: (string | { key: string; url: string })[];
  extraLoaders: ((chipConfig: chip.ChipConfig) => Promise<any>)[];
  chipInstallers: ((
    chipConfig: chip.ChipConfig,
    chip: chip.ParallelChip
  ) => void)[];
  states: chip.StateTableDescriptor;
  signals: chip.SignalTable;
  endingScenes: string[];
  screenSize: PIXI.IPoint;
  canvasId: string;
  fpsMeterPosition: string;
  loadingGauge: {
    position: PIXI.IPointData;
    scale: number;
  };
}

export const DEFAULT_DIRECTIVES: any = {
  screenSize: new PIXI.Point(960, 540), // Screen size as PIXI Point
  canvasId: "pixi-canvas", // ID of element to use for PIXI

  // Parameters for the game state machine
  states: [],
  signals: {},
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

  // For narration
  speakers: {},
  speakerPosition: new PIXI.Point(50, 540),

  // Appearance. These assets are automatically added to "graphicalAssets"
  splashScreen: null, // Splash screen should be the size of the game
  gameLogo: null, // Will be displayed in the menu
  extraLogos: [], // Logos besides Play Curious will be shown in the menu

  rootConfig: {}, // Initial value for the rootConfig
  extraLoaders: [], // Will be called after the fixed loading step. Of type function(rootConfig)
  chipInstallers: [], // Will be called when the game is initialized. Of type function(rootConfig, rootChip)

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

const rootConfig: chip.ChipConfig = {
  directives: null,
  app: null,
  preloader: null,
  container: null,
  playOptions: null,
  musicAudio: {},
  videoAssets: {},
  jsonAssets: {},
  subtitles: {},
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
let gameChip: chip.ParallelChip;
let lastFrameInfo: chip.TickInfo;

function getRootChip(): chip.Chip {
  return loadingScene || loadingErrorScene || gameChip;
}

let lastFrameTime = 0;

let previousGameState: chip.GameState = null;
let gameState: chip.GameState = "preloading";
let playTime = 0;
let timeSinceStart = 0;

let pixiLoaderProgress = 0;
let fontLoaderProgress = 0;
let fixedAudioLoaderProgress = 0;
let videoLoaderProgress = 0;
let variableAudioLoaderProgress = 0;

// Only send updates on non-paused entties
export class FilterPauseChip extends chip.ParallelChip {
  tick(tickInfo: chip.TickInfo) {
    if (tickInfo.gameState === "playing") super.tick(tickInfo);
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

export class CreditsChipOptions {
  // @credits like { "Game Design": ["JC", "Jesse"], }
  credits: { [k: string]: string[] | string } = {};
  textSize = 32;
  fontFamily = "Roboto Condensed";
}

export class MenuChipOptions {
  menuButtonPosition: PIXI.Point = null;
  creditsChipOptions: CreditsChipOptions;
}

export class MenuChip extends chip.CompositeChip {
  public readonly options: MenuChipOptions;

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
  public creditsChip: CreditsChip;
  public fullScreenButton: chip.ToggleSwitch;
  public musicButton: chip.ToggleSwitch;
  public fxButton: chip.ToggleSwitch;
  public subtitlesButton: chip.ToggleSwitch;

  constructor(options?: Partial<MenuChipOptions>) {
    super();

    this.options = util.fillInOptions(options, new MenuChipOptions());
  }

  _onActivate() {
    this.container = new PIXI.Container();
    this.container.name = "menu";

    this.creditsChip = null;

    this.pauseButton = new PIXI.Sprite(
      this._chipConfig.app.loader.resources[
        this._chipConfig.directives.graphics.menu
      ].texture
    );
    this.pauseButton.anchor.set(0.5);
    this.pauseButton.position.copyFrom(
      this.options.menuButtonPosition ??
        new PIXI.Point(this._chipConfig.app.renderer.width - 50, 50)
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
      this._chipConfig.app.screen.width,
      this._chipConfig.app.screen.height
    );
    this.mask.endFill();
    this.mask.alpha = 0.8;
    this.mask.interactive = true;
    this.menuLayer.addChild(this.mask);

    this.menuButtonLayer = new PIXI.Container();
    this.menuLayer.addChild(this.menuButtonLayer);

    this.playButton = new PIXI.Sprite(
      this._chipConfig.app.loader.resources[
        "booyah/images/button-close.png"
      ].texture
    );
    this.playButton.anchor.set(0.5);
    this.playButton.position.set(this._chipConfig.app.renderer.width - 50, 50);
    this.playButton.interactive = true;
    this._on(this.playButton, "pointertap", this._onPlay);
    this.menuButtonLayer.addChild(this.playButton);

    const menuButtonLayerConfig = _.extend({}, this._chipConfig, {
      container: this.menuButtonLayer,
    });

    if (this._chipConfig.directives.gameLogo) {
      const gameLogo = new PIXI.Sprite(
        this._chipConfig.preloader.resources[
          this._chipConfig.directives.gameLogo
        ].texture
      );
      gameLogo.position.set(170, 200);
      gameLogo.anchor.set(0.5, 0.5);
      this.menuButtonLayer.addChild(gameLogo);
    }

    const pcLogo = new PIXI.Sprite(
      this._chipConfig.app.loader.resources[
        "booyah/images/a-playcurious-game.png"
      ].texture
    );
    pcLogo.anchor.set(0.5, 1);
    pcLogo.position.set(170, 450);
    this.menuButtonLayer.addChild(pcLogo);

    if (this._chipConfig.directives.extraLogos) {
      // Divide space, align to the right
      const spacePerLogo =
        (this._chipConfig.app.renderer.width - 160 * 2) /
        this._chipConfig.directives.extraLogos.length;
      for (let i = 0; i < this._chipConfig.directives.extraLogos.length; i++) {
        const logoSprite = new PIXI.Sprite(
          this._chipConfig.app.loader.resources[
            this._chipConfig.directives.extraLogos[i]
          ].texture
        );
        logoSprite.anchor.set(0.5, 1);
        logoSprite.position.set(
          this._chipConfig.app.renderer.width - 160 - spacePerLogo * i,
          420
        );
        this.menuButtonLayer.addChild(logoSprite);
      }
    }

    if (util.supportsFullscreen()) {
      this.fullScreenButton = new chip.ToggleSwitch({
        onTexture:
          this._chipConfig.app.loader.resources[
            "booyah/images/fullscreen-on.png"
          ].texture,
        offTexture:
          this._chipConfig.app.loader.resources[
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
      this._activateChildChip(this.fullScreenButton, menuButtonLayerConfig);

      // TODO: use event listener to check if full screen was exited manually with ESC key
    } else {
      const fullScreenButton = new PIXI.Sprite(
        this._chipConfig.app.loader.resources[
          "booyah/images/fullscreen-disabled.png"
        ].texture
      );
      fullScreenButton.position.set(405, 130);
      this.menuButtonLayer.addChild(fullScreenButton);
    }

    this.musicButton = new chip.ToggleSwitch({
      onTexture:
        this._chipConfig.app.loader.resources["booyah/images/music-on.png"]
          .texture,
      offTexture:
        this._chipConfig.app.loader.resources["booyah/images/music-off.png"]
          .texture,
      isOn: this._chipConfig.playOptions.options.musicOn,
      position: new PIXI.Point(405, 230),
    });
    this._on(this.musicButton, "change", this._onChangeMusicIsOn as any);
    this._activateChildChip(this.musicButton, menuButtonLayerConfig);

    // TODO prevent being able to turn both subtitles and sound off

    this.fxButton = new chip.ToggleSwitch({
      onTexture:
        this._chipConfig.app.loader.resources["booyah/images/voices-on.png"]
          .texture,
      offTexture:
        this._chipConfig.app.loader.resources["booyah/images/voices-off.png"]
          .texture,
      isOn: this._chipConfig.playOptions.options.fxOn,
      position: new PIXI.Point(630, 230),
    });
    this._on(this.fxButton, "change", this._onChangeFxIsOn as any);
    this._activateChildChip(this.fxButton, menuButtonLayerConfig);

    this.subtitlesButton = new chip.ToggleSwitch({
      onTexture:
        this._chipConfig.app.loader.resources["booyah/images/subtitles-on.png"]
          .texture,
      offTexture:
        this._chipConfig.app.loader.resources["booyah/images/subtitles-off.png"]
          .texture,
      isOn: this._chipConfig.playOptions.options.showSubtitles,
      position: new PIXI.Point(630, 130),
    });
    this._on(
      this.subtitlesButton,
      "change",
      this._onChangeShowSubtitles as any
    );
    this._activateChildChip(this.subtitlesButton, menuButtonLayerConfig);

    const creditLink = new PIXI.Text("Credits", {
      fontFamily: "Roboto Condensed",
      fontSize: 32,
      fill: "white",
      strokeThickness: 4,
    });
    creditLink.anchor.set(0.5, 0.5);
    creditLink.position.set(this._chipConfig.app.renderer.width / 2 - 10, 492);
    creditLink.interactive = true;
    this._on(creditLink, "pointertap", this._showCredits);
    this.menuButtonLayer.addChild(creditLink);

    // Language switching buttons
    if (this._chipConfig.directives.supportedLanguages) {
      for (
        let i = 0;
        i < this._chipConfig.directives.supportedLanguages.length;
        i++
      ) {
        const language = this._chipConfig.directives.supportedLanguages[i];
        const isSelected = language === this._chipConfig.directives.language;
        const sprite = new PIXI.Sprite(
          this._chipConfig.app.loader.resources[
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
        this._chipConfig.app.screen.width,
        this._chipConfig.app.screen.height
      );
      mask.endFill();
      mask.alpha = 0.8;
      mask.interactive = true;
      this.switchLanguageConfirmLayer.addChild(mask);

      this.confirmLanguageButton = new PIXI.Sprite();
      this.confirmLanguageButton.anchor.set(0.5);
      this.confirmLanguageButton.scale.set(1.5);
      this.confirmLanguageButton.position.set(
        this._chipConfig.app.renderer.width / 2,
        this._chipConfig.app.renderer.height / 2
      );
      this.confirmLanguageButton.interactive = true;
      // Event handler is added later, in _onSwitchLanguage()
      this.switchLanguageConfirmLayer.addChild(this.confirmLanguageButton);

      const cancelSwitchLanguageButton = new PIXI.Sprite(
        this._chipConfig.app.loader.resources[
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
        this._chipConfig.app.loader.resources[
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
        this._chipConfig.app.screen.width,
        this._chipConfig.app.screen.height
      );
      this.resetMask.endFill();
      this.resetMask.alpha = 0.8;
      this.resetMask.interactive = true;
      this.resetConfirmLayer.addChild(this.resetMask);

      this.confirmResetButton = new PIXI.Sprite(
        this._chipConfig.app.loader.resources[
          "booyah/images/button-replay.png"
        ].texture
      );
      this.confirmResetButton.anchor.set(0.5);
      this.confirmResetButton.position.set(
        this._chipConfig.app.renderer.width / 2,
        this._chipConfig.app.renderer.height / 2
      );
      this.confirmResetButton.interactive = true;
      this._on(this.confirmResetButton, "pointertap", this._onConfirmReset);
      this.resetConfirmLayer.addChild(this.confirmResetButton);

      const cancelResetButton = new PIXI.Sprite(
        this._chipConfig.app.loader.resources[
          "booyah/images/button-back.png"
        ].texture
      );
      cancelResetButton.anchor.set(0.5);
      cancelResetButton.position.set(50);
      cancelResetButton.interactive = true;
      this._on(cancelResetButton, "pointertap", this._onCancelReset);
      this.resetConfirmLayer.addChild(cancelResetButton);
    }

    this._chipConfig.container.addChild(this.container);
  }

  _onTick(tickInfo: chip.TickInfo) {
    if (this.creditsChip) {
      if (this.creditsChip.signal) {
        this._deactivateChildChip(this.creditsChip);
        this.creditsChip = null;
      }
    }
  }

  _onTerminate() {
    this._chipConfig.container.removeChild(this.container);
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
    this._chipConfig.playOptions.setOption("musicOn", isOn);
  }

  _onChangeFxIsOn(isOn: boolean) {
    this._chipConfig.playOptions.setOption("fxOn", isOn);
  }

  _onChangeShowSubtitles(showSubtitles: boolean) {
    this._chipConfig.playOptions.setOption("showSubtitles", showSubtitles);
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
    this.creditsChip = new CreditsChip(this.options.creditsChipOptions);
    this._activateChildChip(this.creditsChip);
  }

  _onSwitchLanguage(language: string) {
    this.confirmLanguageButton.texture =
      this._chipConfig.app.loader.resources[
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

export function makeInstallMenu(options?: Partial<MenuChipOptions>) {
  return (rootConfig: any, rootChip: any) => {
    rootConfig.menu = new MenuChip(options);
    rootChip.addChildChip(rootConfig.menu);
  };
}

export function installMenu(rootConfig: any, rootChip: any) {
  rootConfig.menu = new MenuChip();
  rootChip.addChildChip(rootConfig.menu);
}

export class CreditsChip extends chip.CompositeChip {
  public container: PIXI.Container;
  public mask: PIXI.Graphics;

  private _options: CreditsChipOptions;

  constructor(options: Partial<CreditsChipOptions>) {
    super();

    this._options = util.fillInOptions(options, new CreditsChipOptions());
  }

  _onActivate() {
    this.container = new PIXI.Container();

    let rolesText = "";
    let peopleText = "";
    let didFirstLine = false;
    for (let role in this._options.credits) {
      if (didFirstLine) {
        rolesText += "\n";
        peopleText += "\n";
      } else {
        didFirstLine = true;
      }

      rolesText += role;

      // Their could be one person credited (string), or an array
      const people = _.isArray(this._options.credits[role])
        ? this._options.credits[role]
        : [this._options.credits[role]];
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
      this._chipConfig.app.screen.width,
      this._chipConfig.app.screen.height
    );
    mask.endFill();
    mask.alpha = 0.8;
    mask.interactive = true;
    this.container.addChild(mask);

    const closeButton = new PIXI.Sprite(
      this._chipConfig.app.loader.resources[
        "booyah/images/button-back.png"
      ].texture
    );
    closeButton.anchor.set(0.5);
    closeButton.position.set(50);
    closeButton.interactive = true;
    this._on(
      closeButton,
      "pointertap",
      () => (this._outputSignal = chip.makeSignal())
    );
    this.container.addChild(closeButton);

    const roles = new PIXI.Text(rolesText, {
      fontFamily: this._options.fontFamily,
      fontSize: this._options.textSize,
      fill: "white",
      align: "right",
    });
    roles.anchor.set(1, 0.5);
    roles.position.set(
      this._chipConfig.app.renderer.width / 2 - 10,
      this._chipConfig.app.renderer.height / 2
    );
    this.container.addChild(roles);

    const people = new PIXI.Text(peopleText, {
      fontFamily: this._options.fontFamily,
      fontSize: this._options.textSize,
      fill: "white",
      align: "left",
    });
    people.anchor.set(0, 0.5);
    people.position.set(
      this._chipConfig.app.renderer.width / 2 + 10,
      this._chipConfig.app.renderer.height / 2
    );
    this.container.addChild(people);

    this._chipConfig.container.addChild(this.container);
  }

  _onTerminate() {
    this._chipConfig.container.removeChild(this.container);
  }
}

export class LoadingScene extends chip.ChipBase {
  progress: number;
  shouldUpdateProgress: boolean;
  container: PIXI.Container;
  loadingContainer: PIXI.Container;
  loadingFill: PIXI.Graphics;
  loadingCircle: PIXI.Sprite;

  _onActivate() {
    this.progress = 0;
    this.shouldUpdateProgress = true;

    this.container = new PIXI.Container();

    if (this._chipConfig.directives.splashScreen) {
      this.container.addChild(
        new PIXI.Sprite(
          this._chipConfig.preloader.resources[
            this._chipConfig.directives.splashScreen
          ].texture
        )
      );
    }

    const centerPos: PIXI.IPoint =
      this._chipConfig.directives.loadingGauge.position;
    const scale: number = this._chipConfig.directives.loadingGauge.scale;

    this.loadingContainer = new PIXI.Container();
    this.container.addChild(this.loadingContainer);

    this.loadingFill = new PIXI.Graphics();
    this.loadingFill.position.set(
      centerPos.x - 50 * scale,
      centerPos.y - 50 * scale
    );
    this.loadingContainer.addChild(this.loadingFill);

    const loadingFillMask = new PIXI.Graphics();
    loadingFillMask.beginFill(0xffffff);
    loadingFillMask.drawCircle(0, 0, 50 * scale);
    loadingFillMask.endFill();
    loadingFillMask.position.copyFrom(centerPos);
    this.loadingContainer.addChild(loadingFillMask);

    this.loadingFill.mask = loadingFillMask;

    this.loadingCircle = new PIXI.Sprite(
      this._chipConfig.preloader.resources[
        "booyah/images/loader-circle.png"
      ].texture
    );
    this.loadingCircle.anchor.set(0.5);
    this.loadingCircle.scale.set(
      this._chipConfig.directives.loadingGauge.scale
    );
    this.loadingCircle.position.copyFrom(
      this._chipConfig.directives.loadingGauge.position
    );
    this.loadingContainer.addChild(this.loadingCircle);

    this._chipConfig.container.addChild(this.container);
  }

  _onTick() {
    this.loadingCircle.rotation +=
      LOADING_SCENE_SPIN_SPEED * this._lastFrameInfo.timeScale;

    if (this.shouldUpdateProgress) {
      const scale: number = this._chipConfig.directives.loadingGauge.scale;
      const height = this.progress * 100; // Because the graphic happens to be 100px tall

      this.loadingFill.clear();
      this.loadingFill.beginFill(0xffffff);
      this.loadingFill.drawRect(0, 100 * scale, 100 * scale, -height * scale);
      this.loadingFill.endFill();

      this.shouldUpdateProgress = false;
    }
  }

  _onTerminate(tickInfo: chip.TickInfo) {
    this._chipConfig.container.removeChild(this.container);
  }

  updateProgress(fraction: number) {
    this.progress = fraction;
    this.shouldUpdateProgress = true;
  }
}

export class ReadyScene extends chip.ChipBase {
  container: PIXI.Container;

  _onActivate() {
    this.container = new PIXI.Container();

    if (this._chipConfig.directives.splashScreen) {
      this.container.addChild(
        new PIXI.Sprite(
          this._chipConfig.preloader.resources[
            this._chipConfig.directives.splashScreen
          ].texture
        )
      );
    }

    const button = new PIXI.Sprite(
      this._chipConfig.app.loader.resources[
        this._chipConfig.directives.graphics.play
      ].texture
    );
    button.anchor.set(0.5);
    button.scale.set(this._chipConfig.directives.loadingGauge.scale);
    button.position.copyFrom(this._chipConfig.directives.loadingGauge.position);
    this._on(
      button,
      "pointertap",
      () => (this._outputSignal = chip.makeSignal())
    );
    button.interactive = true;
    this.container.addChild(button);

    this._chipConfig.container.addChild(this.container);
  }

  _onTerminate() {
    this._chipConfig.container.removeChild(this.container);
  }
}

export class LoadingErrorScene extends chip.ChipBase {
  container: PIXI.Container;

  _onActivate() {
    this.container = new PIXI.Container();

    if (this._chipConfig.directives.splashScreen) {
      this.container.addChild(
        new PIXI.Sprite(
          this._chipConfig.preloader.resources[
            this._chipConfig.directives.splashScreen
          ].texture
        )
      );
    }

    const button = new PIXI.Sprite(
      this._chipConfig.preloader.resources[
        "booyah/images/loader-error.png"
      ].texture
    );
    button.anchor.set(0.5);
    button.scale.set(this._chipConfig.directives.loadingGauge.scale);
    button.position.copyFrom(this._chipConfig.directives.loadingGauge.position);
    this.container.addChild(button);

    this._chipConfig.container.addChild(this.container);
  }

  _onTerminate() {
    this._chipConfig.container.removeChild(this.container);
  }
}

export class DoneScene extends chip.ChipBase {
  container: PIXI.Container;

  _onActivate() {
    this.container = new PIXI.Container();

    if (this._chipConfig.directives.splashScreen) {
      this.container.addChild(
        new PIXI.Sprite(
          this._chipConfig.preloader.resources[
            this._chipConfig.directives.splashScreen
          ].texture
        )
      );
    }

    const button = new PIXI.Sprite(
      this._chipConfig.app.loader.resources[
        "booyah/images/button-replay.png"
      ].texture
    );
    button.anchor.set(0.5);
    button.position.copyFrom(this._chipConfig.directives.loadingGauge.position);
    this._on(
      button,
      "pointertap",
      () => (this._outputSignal = chip.makeSignal())
    );
    button.interactive = true;
    this.container.addChild(button);

    this._chipConfig.container.addChild(this.container);
  }

  _onTerminate() {
    this._chipConfig.container.removeChild(this.container);
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

function tick(timeScale: number) {
  const frameTime = Date.now();
  const timeSinceLastFrame = frameTime - lastFrameTime;
  lastFrameTime = frameTime;

  // Only count "play time" as compared to clock time
  if (gameState == "playing") {
    playTime += timeSinceLastFrame;
    timeSinceStart += timeSinceLastFrame;
  }

  lastFrameInfo = {
    playTime,
    timeSinceStart,
    timeSinceLastFrame,
    timeScale,
    gameState,
  };

  getRootChip().tick(lastFrameInfo);

  rootConfig.app.renderer.render(rootConfig.app.stage);
}

export function changeGameState(newGameState: chip.GameState) {
  console.log("switching from game state", gameState, "to", newGameState);

  let previousGameState = gameState;
  gameState = newGameState;

  if (lastFrameInfo) lastFrameInfo.gameState = newGameState;

  if (previousGameState !== newGameState) {
    if (previousGameState == "playing" && newGameState == "paused") {
      getRootChip().onSignal(lastFrameInfo, "pause");
    } else if (previousGameState == "paused" && newGameState == "playing") {
      getRootChip().onSignal(lastFrameInfo, "play");
    }
  }

  util.sendMetrics("send", "event", "changeGameState", newGameState);
}

function loadFixedAssets() {
  changeGameState("loadingFixed");

  util.endTiming("preload");
  util.startTiming("loadFixed");

  // Load graphical assets
  const pixiLoaderResources = _.unique(
    [].concat(
      GRAPHICAL_ASSETS,
      _.values(rootConfig.directives.graphics),
      rootConfig.directives.graphicalAssets
    )
  );
  rootConfig.app.loader.add(pixiLoaderResources);
  rootConfig.app.loader.onProgress.add(pixiLoadProgressHandler);

  const fonts = rootConfig.directives.fontAssets;
  const fontLoaderPromises = _.map(fonts, (name) => {
    return new FontFaceObserver(name)
      .load(FONT_OBSERVER_CHARS)
      .then(() => {
        fontLoaderProgress += 1 / fonts.length;
        updateLoadingProgress();
      })
      .catch((e: any) => {
        console.warn("Cannot load font", name, "due to error", e);

        // On Firefox, this will randomly timeout although font was loaded correctly
        // throw e;
      });
  });

  // load json
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
            (name: string) => `video/${name}.mp4`
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
  lastFrameInfo = {
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
  loadingScene?.terminate(lastFrameInfo);
  loadingScene = null;

  // The new rootChip will contain all the sub entities
  gameChip = new chip.ParallelChip();

  // gameSequence will have the ready and done scenes
  const gameSequence = new chip.ChipSequence(
    [new ReadyScene(), rootConfig.gameStateMachine, new DoneScene()],
    { loop: true }
  );

  // Filter out the pause event for the game sequence
  gameChip.addChildChip(
    new FilterPauseChip([
      new chip.ContainerChip([gameSequence], "gameSequence"),
    ])
  );

  for (const installer of rootConfig.directives.chipInstallers) {
    installer(rootConfig, gameChip);
  }

  if (rootConfig.menu) {
    rootConfig.menu.on("pause", () => changeGameState("paused"));
    rootConfig.menu.on("play", () => changeGameState("playing"));
    rootConfig.menu.on("reset", () => {
      gameChip.onSignal(rootConfig.menu.lastFrameInfo, "reset");
      changeGameState("playing");
    });
  }

  setupVisibilityDetection();

  gameChip.activate(lastFrameInfo, rootConfig, chip.makeSignal());
}

/** Detect when the page is not shown, and pause the game */
function setupVisibilityDetection() {
  // Based on https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API
  const d: any = document;

  let hiddenProperty: string;
  let visibilityChangeProperty: string;

  if (typeof d.hidden !== "undefined") {
    // Opera 12.10 and Firefox 18 and later support
    hiddenProperty = "hidden";
    visibilityChangeProperty = "visibilitychange";
  } else if (typeof d.msHidden !== "undefined") {
    hiddenProperty = "msHidden";
    visibilityChangeProperty = "msvisibilitychange";
  } else if (typeof d.webkitHidden !== "undefined") {
    hiddenProperty = "webkitHidden";
    visibilityChangeProperty = "webkitvisibilitychange";
  }

  // If the page is hidden, pause the video;
  // if the page is shown, play the video
  function handleVisibilityChange() {
    if (d[hiddenProperty]) {
      console.log("Lost visibility. Hiding the game");

      getRootChip().onSignal(lastFrameInfo, "lostVisibility");
      changeGameState("paused");
    } else {
      getRootChip().onSignal(lastFrameInfo, "gainedVisibility");
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

function makePreloader(additionalAssets: string[]) {
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

  rootConfig.gameStateMachine = new chip.StateMachine(
    rootConfig.directives.states,
    {
      signals: rootConfig.directives.signals,
      startingState: chip.makeSignal(
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

  const tickInfo: chip.TickInfo = {
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

      // The loading scene doesn't get the full chipConfig
      loadingScene.activate(tickInfo, rootConfig, chip.makeSignal());

      rootConfig.app.ticker.add(tick);

      if (rootConfig.playOptions.options.fpsMeterPosition !== "none")
        rootConfig.app.ticker.add(updateFpsMeter);
    })
    .then(() => loadFixedAssets())
    .then(loadVariable)
    .then(doneLoading)
    .catch((err) => {
      console.error("Error during load", err);

      // Replace loading scene with loading error
      loadingScene?.terminate(tickInfo);
      loadingScene = null;

      loadingErrorScene = new LoadingErrorScene();
      getRootChip().activate(tickInfo, rootConfig, chip.makeSignal());

      throw err;
    });

  return {
    rootConfig,
    rootChip: getRootChip(),
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
