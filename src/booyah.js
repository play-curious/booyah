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
    world: null
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
            startingProgress: directives.startingProgress
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
    ga("send", "event", "loading", "start");
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYm9veWFoLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vdHlwZXNjcmlwdC9ib295YWgudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsT0FBTyxLQUFLLElBQUksTUFBTSxRQUFRLENBQUM7QUFDL0IsT0FBTyxLQUFLLE1BQU0sTUFBTSxVQUFVLENBQUM7QUFDbkMsT0FBTyxLQUFLLEtBQUssTUFBTSxTQUFTLENBQUM7QUFFakMseUVBQXlFO0FBQ3pFLE9BQU8sT0FBTyxNQUFNLGtCQUFrQixDQUFDO0FBQ3ZDLE9BQU8sS0FBSyxDQUFDLE1BQU0sWUFBWSxDQUFDO0FBMkNoQyxNQUFNLGtCQUFrQixHQUFPO0lBQzdCLFVBQVUsRUFBRSxJQUFJLElBQUksQ0FBQyxLQUFLLENBQUMsR0FBRyxFQUFFLEdBQUcsQ0FBQztJQUNwQyxRQUFRLEVBQUUsYUFBYTtJQUV2Qix3Q0FBd0M7SUFDeEMsTUFBTSxFQUFFLEVBQUU7SUFDVixXQUFXLEVBQUUsRUFBRTtJQUNmLGFBQWEsRUFBRSxPQUFPO0lBQ3RCLG1CQUFtQixFQUFFLEVBQUU7SUFDdkIsZ0JBQWdCLEVBQUUsRUFBRTtJQUNwQixZQUFZLEVBQUUsQ0FBQyxLQUFLLENBQUM7SUFFckIsU0FBUztJQUNULGVBQWUsRUFBRSxFQUFFO0lBQ25CLFdBQVcsRUFBRSxFQUFFO0lBQ2YsUUFBUSxFQUFFLEVBQUU7SUFDWixXQUFXLEVBQUUsRUFBRTtJQUNmLFVBQVUsRUFBRSxFQUFFO0lBQ2QsVUFBVSxFQUFFLEVBQUU7SUFFZCxnQkFBZ0I7SUFDaEIsUUFBUSxFQUFFLEVBQUU7SUFDWixlQUFlLEVBQUUsSUFBSSxJQUFJLENBQUMsS0FBSyxDQUFDLEVBQUUsRUFBRSxHQUFHLENBQUM7SUFFeEMsVUFBVTtJQUNWLE9BQU8sRUFBRSxFQUFFO0lBQ1gsZUFBZSxFQUFFLEVBQUU7SUFFbkIsd0VBQXdFO0lBQ3hFLFlBQVksRUFBRSxJQUFJO0lBQ2xCLFFBQVEsRUFBRSxJQUFJO0lBQ2QsVUFBVSxFQUFF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