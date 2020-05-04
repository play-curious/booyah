import * as util from "./util";
import * as entity from "./entity";
import * as audio from "./audio";
// TODO: Once the PR has been accepted, move back to the version from NPM
import preload from "./preload-it.esm";
import * as _ from "underscore";
const DEFAULT_DIRECTIVES = {
    screenSize: new PIXI.Point(960, 540),
    canvasId: "pixi-canvas",
    // Parameters for the game state machine
    states: [],
    transitions: {},
    startingScene: "start",
    startingSceneParams: {},
    startingProgress: {},
    endingScenes: ["end"],
    // Assets
    graphicalAssets: [],
    musicAssets: [],
    fxAssets: [],
    videoAssets: [],
    fontAssets: [],
    jsonAssets: [],
    // For narration
    speakers: {},
    speakerPosition: new PIXI.Point(50, 540),
    // Credits
    credits: {},
    creditsTextSize: 32,
    // Appearance. These assets are automatically added to "graphicalAssets"
    splashScreen: null,
    gameLogo: null,
    extraLogos: [],
    rootConfig: {},
    extraLoaders: [],
    entityInstallers: [],
    language: null,
    supportedLanguages: [],
    menuButtonPosition: null,
    // Standard icons. They will be added to "graphicalAssets"
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
let videoLoaderProgress = 0;
let variableAudioLoaderProgress = 0;
// Only send updates on non-paused entties
class FilterPauseEntity extends entity.CompositeEntity {
    update(options) {
        if (options.gameState == "playing")
            super.update(options);
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
            this.options.showSubtitles = util.stringToBool(searchParams.get("subtitles"));
        if (searchParams.has("scene"))
            this.options.scene = searchParams.get("scene");
        if (searchParams.has("params"))
            this.options.sceneParams = JSON.parse(searchParams.get("params"));
        if (searchParams.has("progress"))
            this.options.startingProgress = JSON.parse(searchParams.get("progress"));
        if (searchParams.has("mute") &&
            util.stringToBool(searchParams.get("mute"))) {
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
        this.pauseButton = new PIXI.Sprite(this.config.app.loader.resources[this.config.directives.graphics.menu].texture);
        this.pauseButton.anchor.set(0.5);
        if (this.config.directives.menuButtonPosition) {
            this.pauseButton.position = this.config.directives.menuButtonPosition;
        }
        else {
            this.pauseButton.position.set(this.config.app.renderer.width - 50, 50);
        }
        this.pauseButton.interactive = true;
        this._on(this.pauseButton, "pointertap", this._onPause);
        this.container.addChild(this.pauseButton);
        this.menuLayer = new PIXI.Container();
        this.menuLayer.visible = false;
        this.container.addChild(this.menuLayer);
        this.mask = new PIXI.Graphics();
        this.mask.beginFill(0x000000);
        this.mask.drawRect(0, 0, this.config.app.screen.width, this.config.app.screen.height);
        this.mask.endFill();
        this.mask.alpha = 0.8;
        this.mask.interactive = true;
        this.menuLayer.addChild(this.mask);
        this.menuButtonLayer = new PIXI.Container();
        this.menuLayer.addChild(this.menuButtonLayer);
        this.playButton = new PIXI.Sprite(this.config.app.loader.resources["booyah/images/button-close.png"].texture);
        this.playButton.anchor.set(0.5);
        this.playButton.position.set(this.config.app.renderer.width - 50, 50);
        this.playButton.interactive = true;
        this._on(this.playButton, "pointertap", this._onPlay);
        this.menuButtonLayer.addChild(this.playButton);
        const menuButtonLayerConfig = _.extend({}, this.config, {
            container: this.menuButtonLayer
        });
        if (this.config.directives.gameLogo) {
            const gameLogo = new PIXI.Sprite(this.config.preloader.resources[this.config.directives.gameLogo].texture);
            gameLogo.position.set(170, 200);
            gameLogo.anchor.set(0.5, 0.5);
            this.menuButtonLayer.addChild(gameLogo);
        }
        const pcLogo = new PIXI.Sprite(this.config.app.loader.resources["booyah/images/a-playcurious-game.png"].texture);
        pcLogo.anchor.set(0.5, 1);
        pcLogo.position.set(170, 450);
        this.menuButtonLayer.addChild(pcLogo);
        if (this.config.directives.extraLogos) {
            // Divide space, align to the right
            const spacePerLogo = (this.config.app.renderer.width - 160 * 2) /
                this.config.directives.extraLogos.length;
            for (let i = 0; i < this.config.directives.extraLogos.length; i++) {
                const logoSprite = new PIXI.Sprite(this.config.app.loader.resources[this.config.directives.extraLogos[i]].texture);
                logoSprite.anchor.set(0.5, 1);
                logoSprite.position.set(this.config.app.renderer.width - 160 - spacePerLogo * i, 420);
                this.menuButtonLayer.addChild(logoSprite);
            }
        }
        if (util.supportsFullscreen(document.getElementById("game-parent"))) {
            this.fullScreenButton = new entity.ToggleSwitch({
                onTexture: this.config.app.loader.resources["booyah/images/fullscreen-on.png"].texture,
                offTexture: this.config.app.loader.resources["booyah/images/fullscreen-off.png"].texture,
                isOn: false,
                position: new PIXI.Point(405, 130)
            });
            this._on(this.fullScreenButton, "change", this._onChangeFullScreen);
            this.fullScreenButton.setup(menuButtonLayerConfig);
            this.addEntity(this.fullScreenButton);
            // TODO: use event listener to check if full screen was exited manually with ESC key
        }
        else {
            const fullScreenButton = new PIXI.Sprite(this.config.app.loader.resources["booyah/images/fullscreen-disabled.png"].texture);
            fullScreenButton.position.set(405, 130);
            this.menuButtonLayer.addChild(fullScreenButton);
        }
        this.musicButton = new entity.ToggleSwitch({
            onTexture: this.config.app.loader.resources["booyah/images/music-on.png"]
                .texture,
            offTexture: this.config.app.loader.resources["booyah/images/music-off.png"].texture,
            isOn: this.config.playOptions.options.musicOn,
            position: new PIXI.Point(405, 230)
        });
        this._on(this.musicButton, "change", this._onChangeMusicIsOn);
        this.musicButton.setup(menuButtonLayerConfig);
        this.addEntity(this.musicButton);
        // TODO prevent being able to turn both subtitles and sound off
        this.fxButton = new entity.ToggleSwitch({
            onTexture: this.config.app.loader.resources["booyah/images/voices-on.png"]
                .texture,
            offTexture: this.config.app.loader.resources["booyah/images/voices-off.png"].texture,
            isOn: this.config.playOptions.options.fxOn,
            position: new PIXI.Point(630, 230)
        });
        this._on(this.fxButton, "change", this._onChangeFxIsOn);
        this.fxButton.setup(menuButtonLayerConfig);
        this.addEntity(this.fxButton);
        this.subtitlesButton = new entity.ToggleSwitch({
            onTexture: this.config.app.loader.resources["booyah/images/subtitles-on.png"].texture,
            offTexture: this.config.app.loader.resources["booyah/images/subtitles-off.png"].texture,
            isOn: this.config.playOptions.options.showSubtitles,
            position: new PIXI.Point(630, 130)
        });
        this._on(this.subtitlesButton, "change", this._onChangeShowSubtitles);
        this.subtitlesButton.setup(menuButtonLayerConfig);
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
        this.menuButtonLayer.addChild(creditLink);
        // Language switching buttons
        if (this.config.directives.supportedLanguages) {
            for (let i = 0; i < this.config.directives.supportedLanguages.length; i++) {
                const language = this.config.directives.supportedLanguages[i];
                const isSelected = language === this.config.directives.language;
                const sprite = new PIXI.Sprite(this.config.app.loader.resources[`booyah/images/lang-${language}-${isSelected ? "off" : "on"}.png`].texture);
                sprite.position.set(405 + i * 100, 330);
                if (!isSelected) {
                    sprite.interactive = true;
                    this._on(sprite, "pointertap", () => this._onSwitchLanguage(language));
                }
                this.menuButtonLayer.addChild(sprite);
            }
            this.switchLanguageConfirmLayer = new PIXI.Container();
            this.switchLanguageConfirmLayer.visible = false;
            this.menuLayer.addChild(this.switchLanguageConfirmLayer);
            const mask = new PIXI.Graphics();
            mask.beginFill(0x000000);
            mask.drawRect(0, 0, this.config.app.screen.width, this.config.app.screen.height);
            mask.endFill();
            mask.alpha = 0.8;
            mask.interactive = true;
            this.switchLanguageConfirmLayer.addChild(mask);
            this.confirmLanguageButton = new PIXI.Sprite();
            this.confirmLanguageButton.anchor.set(0.5);
            this.confirmLanguageButton.scale.set(1.5);
            this.confirmLanguageButton.position.set(this.config.app.renderer.width / 2, this.config.app.renderer.height / 2);
            this.confirmLanguageButton.interactive = true;
            // Event handler is added later, in _onSwitchLanguage()
            this.switchLanguageConfirmLayer.addChild(this.confirmLanguageButton);
            const cancelSwitchLanguageButton = new PIXI.Sprite(this.config.app.loader.resources["booyah/images/button-back.png"].texture);
            cancelSwitchLanguageButton.anchor.set(0.5);
            cancelSwitchLanguageButton.position.set(50);
            cancelSwitchLanguageButton.interactive = true;
            this._on(cancelSwitchLanguageButton, "pointertap", this._onCancelSwitchLanguage);
            this.switchLanguageConfirmLayer.addChild(cancelSwitchLanguageButton);
        }
        // Restart button
        {
            this.resetButton = new PIXI.Sprite(this.config.app.loader.resources["booyah/images/button-replay.png"].texture);
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
            this.resetMask.drawRect(0, 0, this.config.app.screen.width, this.config.app.screen.height);
            this.resetMask.endFill();
            this.resetMask.alpha = 0.8;
            this.resetMask.interactive = true;
            this.resetConfirmLayer.addChild(this.resetMask);
            this.confirmResetButton = new PIXI.Sprite(this.config.app.loader.resources["booyah/images/button-replay.png"].texture);
            this.confirmResetButton.anchor.set(0.5);
            this.confirmResetButton.position.set(this.config.app.renderer.width / 2, this.config.app.renderer.height / 2);
            this.confirmResetButton.interactive = true;
            this._on(this.confirmResetButton, "pointertap", this._onConfirmReset);
            this.resetConfirmLayer.addChild(this.confirmResetButton);
            const cancelResetButton = new PIXI.Sprite(this.config.app.loader.resources["booyah/images/button-back.png"].texture);
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
        if (turnOn)
            util.requestFullscreen(document.getElementById("game-parent"));
        else
            util.exitFullscreen();
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
    _onSwitchLanguage(language) {
        this.confirmLanguageButton.texture = this.config.app.loader.resources[`booyah/images/lang-${language}-on.png`].texture;
        this._on(this.confirmLanguageButton, "pointertap", () => this._onConfirmSwitchLanguage(language));
        this.switchLanguageConfirmLayer.visible = true;
    }
    _onConfirmSwitchLanguage(language) {
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
export function installMenu(rootConfig, rootEntity) {
    rootConfig.menu = new MenuEntity();
    rootEntity.addEntity(rootConfig.menu);
}
export class CreditsEntity extends entity.CompositeEntity {
    _setup(config) {
        this.container = new PIXI.Container();
        let rolesText = '';
        let peopleText = '';
        let didFirstLine = false;
        for (let role in this.config.directives.credits) {
            if (didFirstLine) {
                rolesText += "\n";
                peopleText += "\n";
            }
            else {
                didFirstLine = true;
            }
            rolesText += role;
            // Their could be one person credited (string), or an array
            const people = _.isArray(this.config.directives.credits[role])
                ? this.config.directives.credits[role]
                : [this.config.directives.credits[role]];
            for (let person of people) {
                rolesText += "\n";
                peopleText += person + "\n";
            }
        }
        const mask = new PIXI.Graphics();
        mask.beginFill(0x000000);
        mask.drawRect(0, 0, this.config.app.screen.width, this.config.app.screen.height);
        mask.endFill();
        mask.alpha = 0.8;
        mask.interactive = true;
        this.container.addChild(mask);
        const closeButton = new PIXI.Sprite(this.config.app.loader.resources["booyah/images/button-back.png"].texture);
        closeButton.anchor.set(0.5);
        closeButton.position.set(50);
        closeButton.interactive = true;
        this._on(closeButton, "pointertap", () => (this.requestedTransition = true));
        this.container.addChild(closeButton);
        const roles = new PIXI.Text(rolesText, {
            fontFamily: "Roboto Condensed",
            fontSize: this.config.directives.creditsTextSize,
            fill: "white",
            align: "right"
        });
        roles.anchor.set(1, 0.5);
        roles.position.set(this.config.app.renderer.width / 2 - 10, this.config.app.renderer.height / 2);
        this.container.addChild(roles);
        const people = new PIXI.Text(peopleText, {
            fontFamily: "Roboto Condensed",
            fontSize: this.config.directives.creditsTextSize,
            fill: "white",
            align: "left"
        });
        people.anchor.set(0, 0.5);
        people.position.set(this.config.app.renderer.width / 2 + 10, this.config.app.renderer.height / 2);
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
            this.container.addChild(new PIXI.Sprite(this.config.preloader.resources[this.config.directives.splashScreen].texture));
        }
        this.loadingContainer = new PIXI.Container();
        this.container.addChild(this.loadingContainer);
        this.loadingFill = new PIXI.Graphics();
        this.loadingFill.position.set(this.config.app.screen.width / 2 - 50, (this.config.app.screen.height * 3) / 4 - 50);
        this.loadingContainer.addChild(this.loadingFill);
        const loadingFillMask = new PIXI.Graphics();
        loadingFillMask.beginFill(0xffffff);
        loadingFillMask.drawCircle(0, 0, 50);
        loadingFillMask.endFill();
        loadingFillMask.position.set(this.config.app.screen.width / 2, (this.config.app.screen.height * 3) / 4);
        this.loadingContainer.addChild(loadingFillMask);
        this.loadingFill.mask = loadingFillMask;
        this.loadingCircle = new PIXI.Sprite(this.config.preloader.resources["booyah/images/loader-circle.png"].texture);
        this.loadingCircle.anchor.set(0.5);
        this.loadingCircle.position.set(this.config.app.screen.width / 2, (this.config.app.screen.height * 3) / 4);
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
            this.container.addChild(new PIXI.Sprite(this.config.preloader.resources[this.config.directives.splashScreen].texture));
        }
        const button = new PIXI.Sprite(this.config.app.loader.resources[this.config.directives.graphics.play].texture);
        button.anchor.set(0.5);
        button.position.set(this.config.app.screen.width / 2, (this.config.app.screen.height * 3) / 4);
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
            this.container.addChild(new PIXI.Sprite(this.config.preloader.resources[this.config.directives.splashScreen].texture));
        }
        const button = new PIXI.Sprite(this.config.preloader.resources["booyah/images/loader-error.png"].texture);
        button.anchor.set(0.5);
        button.position.set(this.config.app.screen.width / 2, (this.config.app.screen.height * 3) / 4);
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
            this.container.addChild(new PIXI.Sprite(this.config.preloader.resources[this.config.directives.splashScreen].texture));
        }
        const button = new PIXI.Sprite(this.config.app.loader.resources["booyah/images/button-replay.png"].texture);
        button.anchor.set(0.5);
        button.position.set(this.config.app.screen.width / 2, (this.config.app.screen.height * 3) / 4);
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
    const progress = (pixiLoaderProgress +
        fontLoaderProgress +
        fixedAudioLoaderProgress +
        variableAudioLoaderProgress +
        videoLoaderProgress) /
        5;
    console.debug("loading progress", progress, {
        pixiLoaderProgress,
        fontLoaderProgress,
        fixedAudioLoaderProgress,
        variableAudioLoaderProgress,
        videoLoaderProgress
    });
    if (loadingScene)
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
    if (previousGameState !== gameState) {
        if (previousGameState == "playing" && gameState == "paused") {
            rootEntity.onSignal("pause");
        }
        else if (previousGameState == "paused" && gameState == "playing") {
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
    // ga("send", "event", "changeGameState", newGameState);
}
function loadFixedAssets() {
    changeGameState("loadingFixed");
    util.endTiming("preload");
    util.startTiming("loadFixed");
    // Load graphical assets
    const pixiLoaderResources = [].concat(GRAPHICAL_ASSETS, _.values(rootConfig.directives.graphics), rootConfig.directives.graphicalAssets);
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
    const jsonLoaderPromises = _.map(rootConfig.directives.jsonAssets, (jsonAssetDescription) => {
        if (_.isString(jsonAssetDescription)) {
            return util.loadJson(jsonAssetDescription).then(data => {
                rootConfig.jsonAssets[jsonAssetDescription] = data;
            });
        }
        else if (_.isObject(jsonAssetDescription) &&
            jsonAssetDescription.key &&
            jsonAssetDescription.url) {
            return util.loadJson(jsonAssetDescription.url).then(data => {
                rootConfig.jsonAssets[jsonAssetDescription.key] = data;
            });
        }
        else {
            throw new Error(`Unrecognized JSON asset description '${JSON.stringify(jsonAssetDescription)}'`);
        }
    });
    // Load audio
    rootConfig.musicAudio = audio.makeHowls("music", rootConfig.directives.musicAssets);
    const musicLoadPromises = _.map(rootConfig.musicAudio, audio.makeHowlerLoadPromise);
    rootConfig.fxAudio = audio.makeHowls("fx", rootConfig.directives.fxAssets);
    const fxLoadPromises = _.map(rootConfig.fxAudio, audio.makeHowlerLoadPromise);
    const fixedAudioLoaderPromises = [...musicLoadPromises, ...fxLoadPromises];
    _.each(fixedAudioLoaderPromises, p => p.then(() => {
        fixedAudioLoaderProgress += 1 / fixedAudioLoaderPromises.length;
        updateLoadingProgress();
    }));
    // Load video
    const videoLoaderPromises = [];
    if (rootConfig.directives.videoAssets.length > 0) {
        const videoLoader = preload();
        videoLoader.onprogress = (event) => {
            videoLoaderProgress = event.progress / 100;
            updateLoadingProgress();
        };
        videoLoaderPromises.push(videoLoader
            .fetch(rootConfig.directives.videoAssets.map((name) => `video/${name}`))
            .then((assets) => {
            const videoAssets = {};
            for (const asset of assets) {
                const element = util.makeVideoElement();
                element.src = asset.blobUrl;
                videoAssets[asset.url] = element;
            }
            rootConfig.videoAssets = videoAssets;
        })
            .catch(e => {
            console.error("Cannot load videos", e);
            throw e;
        }));
    }
    const promises = _.flatten([
        util.makePixiLoadPromise(rootConfig.app.loader),
        fontLoaderPromises,
        fixedAudioLoaderPromises,
        jsonLoaderPromises,
        videoLoaderPromises
    ], true);
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
    const gameSequence = new entity.EntitySequence([new ReadyScene(), rootConfig.gameStateMachine, new DoneScene()], { loop: true });
    // Filter out the pause event for the game sequence
    rootEntity.addEntity(new FilterPauseEntity([
        new entity.ContainerEntity([gameSequence], "gameSequence")
    ]));
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
    _.extend(rootConfig, directives.rootConfig);
    rootConfig.directives = util.deepDefaults(directives, DEFAULT_DIRECTIVES);
    // Process starting options
    rootConfig.playOptions = new PlayOptions(rootConfig.directives, window.location.search);
    rootConfig.gameStateMachine = new entity.StateMachine(rootConfig.directives.states, rootConfig.directives.transitions, {
        startingState: rootConfig.playOptions.options.scene,
        startingStateParams: rootConfig.playOptions.options.sceneParams,
        startingProgress: rootConfig.playOptions.options.startingProgress,
        endingStates: rootConfig.directives.endingScenes
    });
    rootConfig.gameStateMachine.on("stateChange", onGameStateMachineChange);
    rootConfig.app = new PIXI.Application({
        width: rootConfig.directives.screenSize.x,
        height: rootConfig.directives.screenSize.y,
        view: document.getElementById(rootConfig.directives.canvasId)
    });
    rootConfig.container = rootConfig.app.stage;
    // ga("send", "event", "loading", "start");
    util.startTiming("preload");
    // Setup preloader
    rootConfig.preloader = makePreloader(_.compact([
        rootConfig.directives.splashScreen,
        rootConfig.directives.gameLogo
    ]));
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
        rootEntity,
        loadingPromise
    };
}
function onGameStateMachineChange(nextStateName, nextStateParams, previousStateName, previousStateParams) {
    const url = new URL(window.location.href);
    nextStateParams = nextStateParams
        ? removePrivateProperties(nextStateParams)
        : {};
    url.searchParams.set("scene", nextStateName);
    url.searchParams.set("params", JSON.stringify(nextStateParams));
    url.searchParams.set("progress", JSON.stringify(rootConfig.gameStateMachine.progress));
    console.log("New game state:", nextStateName, nextStateParams);
    console.log("New game state link:", url.href);
}
function removePrivateProperties(obj) {
    const result = {};
    for (const key in obj) {
        if (!key.startsWith("_"))
            result[key] = obj[key];
    }
    return result;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYm9veWFoLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vdHlwZXNjcmlwdC9ib295YWgudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsT0FBTyxLQUFLLElBQUksTUFBTSxRQUFRLENBQUM7QUFDL0IsT0FBTyxLQUFLLE1BQU0sTUFBTSxVQUFVLENBQUM7QUFDbkMsT0FBTyxLQUFLLEtBQUssTUFBTSxTQUFTLENBQUM7QUFFakMseUVBQXlFO0FBQ3pFLE9BQU8sT0FBTyxNQUFNLGtCQUFrQixDQUFDO0FBQ3ZDLE9BQU8sS0FBSyxDQUFDLE1BQU0sWUFBWSxDQUFDO0FBSWhDLE1BQU0sa0JBQWtCLEdBQWM7SUFDcEMsVUFBVSxFQUFFLElBQUksSUFBSSxDQUFDLEtBQUssQ0FBQyxHQUFHLEVBQUUsR0FBRyxDQUFDO0lBQ3BDLFFBQVEsRUFBRSxhQUFhO0lBRXZCLHdDQUF3QztJQUN4QyxNQUFNLEVBQUUsRUFBRTtJQUNWLFdBQVcsRUFBRSxFQUFFO0lBQ2YsYUFBYSxFQUFFLE9BQU87SUFDdEIsbUJBQW1CLEVBQUUsRUFBRTtJQUN2QixnQkFBZ0IsRUFBRSxFQUFFO0lBQ3BCLFlBQVksRUFBRSxDQUFDLEtBQUssQ0FBQztJQUVyQixTQUFTO0lBQ1QsZUFBZSxFQUFFLEVBQUU7SUFDbkIsV0FBVyxFQUFFLEVBQUU7SUFDZixRQUFRLEVBQUUsRUFBRTtJQUNaLFdBQVcsRUFBRSxFQUFFO0lBQ2YsVUFBVSxFQUFFLEVBQUU7SUFDZCxVQUFVLEVBQUUsRUFBRTtJQUVkLGdCQUFnQjtJQUNoQixRQUFRLEVBQUUsRUFBRTtJQUNaLGVBQWUsRUFBRSxJQUFJLElBQUksQ0FBQyxLQUFLLENBQUMsRUFBRSxFQUFFLEdBQUcsQ0FBQztJQUV4QyxVQUFVO0lBQ1YsT0FBTyxFQUFFLEVBQUU7SUFDWCxlQUFlLEVBQUUsRUFBRTtJQUVuQix3RUFBd0U7SUFDeEUsWUFBWSxFQUFFLElBQUk7SUFDbEIsUUFBUSxFQUFFLElBQUk7SUFDZCxVQUFVLEVBQUUs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