import * as entity from "./entity";
declare type Directives = any;
export declare class MenuEntity extends entity.ParallelEntity {
    container: PIXI.Container;
    menuLayer: PIXI.Container;
    menuButtonLayer: PIXI.Container;
    switchLanguageConfirmLayer: PIXI.Container;
    resetConfirmLayer: PIXI.Container;
    pauseButton: PIXI.Sprite;
    playButton: PIXI.Sprite;
    confirmLanguageButton: PIXI.Sprite;
    resetButton: PIXI.Sprite;
    confirmResetButton: PIXI.Sprite;
    mask: PIXI.Graphics;
    resetMask: PIXI.Graphics;
    creditsEntity: CreditsEntity;
    fullScreenButton: entity.ToggleSwitch;
    musicButton: entity.ToggleSwitch;
    fxButton: entity.ToggleSwitch;
    subtitlesButton: entity.ToggleSwitch;
    _setup(config: any): void;
    _update(options: any): void;
    _teardown(): void;
    _onPause(): void;
    _onPlay(): void;
    _onChangeFullScreen(turnOn?: boolean): void;
    _onChangeMusicIsOn(isOn: boolean): void;
    _onChangeFxIsOn(isOn: boolean): void;
    _onChangeShowSubtitles(showSubtitles: boolean): void;
    _onReset(): void;
    _onCancelReset(): void;
    _onConfirmReset(): void;
    _showCredits(): void;
    _onSwitchLanguage(language: string): void;
    _onConfirmSwitchLanguage(language: string): void;
    _onCancelSwitchLanguage(): void;
}
export declare function installMenu(rootConfig: any, rootEntity: any): void;
export declare class CreditsEntity extends entity.CompositeEntity {
    container: PIXI.Container;
    mask: PIXI.Graphics;
    _setup(config: any): void;
    _teardown(): void;
}
export declare class LoadingScene extends entity.CompositeEntity {
    progress: number;
    shouldUpdateProgress: boolean;
    container: PIXI.Container;
    loadingContainer: PIXI.Container;
    loadingFill: PIXI.Graphics;
    loadingCircle: PIXI.Sprite;
    setup(config: any): void;
    update(options: any): void;
    teardown(): void;
    updateProgress(fraction: number): void;
}
export declare class ReadyScene extends entity.CompositeEntity {
    container: PIXI.Container;
    setup(config: any): void;
    teardown(): void;
}
export declare class LoadingErrorScene extends entity.ParallelEntity {
    container: PIXI.Container;
    _setup(): void;
    _teardown(): void;
}
export declare class DoneScene extends entity.CompositeEntity {
    container: PIXI.Container;
    setup(config: any): void;
    teardown(): void;
}
export declare function makePreloader(additionalAssets: string[]): PIXI.Loader;
export declare function go(directives?: Directives): {
    rootConfig: {
        [key: string]: any;
        directives?: any;
    };
    rootEntity: any;
    loadingPromise: Promise<void>;
};
export {};
