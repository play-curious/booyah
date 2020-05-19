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
        play: "booyah/images/button-play.png",
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
const rootConfig = {
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
let loadingScene;
let rootEntity;
let lastFrameTime = 0;
let previousGameState = null;
let gameState = "preloading";
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
export class PlayOptions extends PIXI.utils.EventEmitter {
    constructor(directives, searchUrl) {
        super();
        this.options = {
            musicOn: true,
            fxOn: true,
            showSubtitles: true,
            sceneParams: directives.startingSceneParams,
            scene: directives.startingScene,
            startingProgress: directives.startingProgress,
        };
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
        //@ts-ignore
        this.options[name] = value;
        this.emit(name, value);
        this.emit("change", name, value);
    }
    getOption(name) {
        //@ts-ignore
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
            container: this.menuButtonLayer,
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
                position: new PIXI.Point(405, 130),
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
            position: new PIXI.Point(405, 230),
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
            position: new PIXI.Point(630, 230),
        });
        this._on(this.fxButton, "change", this._onChangeFxIsOn);
        this.fxButton.setup(menuButtonLayerConfig);
        this.addEntity(this.fxButton);
        this.subtitlesButton = new entity.ToggleSwitch({
            onTexture: this.config.app.loader.resources["booyah/images/subtitles-on.png"].texture,
            offTexture: this.config.app.loader.resources["booyah/images/subtitles-off.png"].texture,
            isOn: this.config.playOptions.options.showSubtitles,
            position: new PIXI.Point(630, 130),
        });
        this._on(this.subtitlesButton, "change", this._onChangeShowSubtitles);
        this.subtitlesButton.setup(menuButtonLayerConfig);
        this.addEntity(this.subtitlesButton);
        const creditLink = new PIXI.Text("Credits", {
            fontFamily: "Roboto Condensed",
            fontSize: 32,
            fill: "white",
            strokeThickness: 4,
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
        let rolesText = "";
        let peopleText = "";
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
            align: "right",
        });
        roles.anchor.set(1, 0.5);
        roles.position.set(this.config.app.renderer.width / 2 - 10, this.config.app.renderer.height / 2);
        this.container.addChild(roles);
        const people = new PIXI.Text(peopleText, {
            fontFamily: "Roboto Condensed",
            fontSize: this.config.directives.creditsTextSize,
            fill: "white",
            align: "left",
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
        videoLoaderProgress,
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
        gameState,
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
    ga("send", "event", "changeGameState", newGameState);
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
    const fontLoaderPromises = _.map(fonts, (name) => {
        return new FontFaceObserver(name)
            .load(FONT_OBSERVER_CHARS)
            .then(() => {
            fontLoaderProgress += 1 / fonts.length;
            updateLoadingProgress();
        })
            .catch((e) => {
            console.error("Cannot load font", name);
            throw e;
        });
    });
    rootConfig.jsonAssets = {};
    const jsonLoaderPromises = _.map(rootConfig.directives.jsonAssets, (jsonAssetDescription) => {
        if (_.isString(jsonAssetDescription)) {
            return util.loadJson(jsonAssetDescription).then((data) => {
                rootConfig.jsonAssets[jsonAssetDescription] = data;
            });
        }
        else if (_.isObject(jsonAssetDescription) &&
            jsonAssetDescription.key &&
            jsonAssetDescription.url) {
            return util.loadJson(jsonAssetDescription.url).then((data) => {
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
    _.each(fixedAudioLoaderPromises, (p) => p.then(() => {
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
            .catch((e) => {
            console.error("Cannot load videos", e);
            throw e;
        }));
    }
    const promises = _.flatten([
        util.makePixiLoadPromise(rootConfig.app.loader),
        fontLoaderPromises,
        fixedAudioLoaderPromises,
        jsonLoaderPromises,
        videoLoaderPromises,
    ], true);
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
        new entity.ContainerEntity([gameSequence], "gameSequence"),
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
        endingStates: rootConfig.directives.endingScenes,
    });
    rootConfig.gameStateMachine.on("stateChange", onGameStateMachineChange);
    rootConfig.app = new PIXI.Application({
        width: rootConfig.directives.screenSize.x,
        height: rootConfig.directives.screenSize.y,
        view: document.getElementById(rootConfig.directives.canvasId),
    });
    rootConfig.container = rootConfig.app.stage;
    ga("send", "event", "loading", "start");
    util.startTiming("preload");
    // Setup preloader
    rootConfig.preloader = makePreloader(_.compact([
        rootConfig.directives.splashScreen,
        rootConfig.directives.gameLogo,
    ]));
    const loadingPromise = Promise.all([
        util.makeDomContentLoadPromise(document),
        util.makePixiLoadPromise(rootConfig.preloader),
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
        .catch((err) => {
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
        loadingPromise,
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYm9veWFoLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vdHlwZXNjcmlwdC9ib295YWgudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsT0FBTyxLQUFLLElBQUksTUFBTSxRQUFRLENBQUM7QUFDL0IsT0FBTyxLQUFLLE1BQU0sTUFBTSxVQUFVLENBQUM7QUFDbkMsT0FBTyxLQUFLLEtBQUssTUFBTSxTQUFTLENBQUM7QUFFakMseUVBQXlFO0FBQ3pFLE9BQU8sT0FBTyxNQUFNLGtCQUFrQixDQUFDO0FBQ3ZDLE9BQU8sS0FBSyxDQUFDLE1BQU0sWUFBWSxDQUFDO0FBZ0RoQyxNQUFNLGtCQUFrQixHQUFRO0lBQzlCLFVBQVUsRUFBRSxJQUFJLElBQUksQ0FBQyxLQUFLLENBQUMsR0FBRyxFQUFFLEdBQUcsQ0FBQztJQUNwQyxRQUFRLEVBQUUsYUFBYTtJQUV2Qix3Q0FBd0M7SUFDeEMsTUFBTSxFQUFFLEVBQUU7SUFDVixXQUFXLEVBQUUsRUFBRTtJQUNmLGFBQWEsRUFBRSxPQUFPO0lBQ3RCLG1CQUFtQixFQUFFLEVBQUU7SUFDdkIsZ0JBQWdCLEVBQUUsRUFBRTtJQUNwQixZQUFZLEVBQUUsQ0FBQyxLQUFLLENBQUM7SUFFckIsU0FBUztJQUNULGVBQWUsRUFBRSxFQUFFO0lBQ25CLFdBQVcsRUFBRSxFQUFFO0lBQ2YsUUFBUSxFQUFFLEVBQUU7SUFDWixXQUFXLEVBQUUsRUFBRTtJQUNmLFVBQVUsRUFBRSxFQUFFO0lBQ2QsVUFBVSxFQUFFLEVBQUU7SUFFZCxnQkFBZ0I7SUFDaEIsUUFBUSxFQUFFLEVBQUU7SUFDWixlQUFlLEVBQUUsSUFBSSxJQUFJLENBQUMsS0FBSyxDQUFDLEVBQUUsRUFBRSxHQUFHLENBQUM7SUFFeEMsVUFBVTtJQUNWLE9BQU8sRUFBRSxFQUFFO0lBQ1gsZUFBZSxFQUFFLEVBQUU7SUFFbkIsd0VBQXdFO0lBQ3hFLFlBQVksRUFBRSxJQUFJO0lBQ2xCLFFBQVEsRUFBRSxJQUFJO0lBQ2QsVUFBVSxFQUFF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