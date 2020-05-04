/// <reference types="howler" />
import * as entity from "./entity.js";
/**
 * @deprecated May not be up to date with other changes in Booyah
 */
export declare class Narrator extends entity.Entity {
    filesToHowl: Map<string, Howl>;
    narrationTable: any;
    container: PIXI.Container;
    narratorSubtitle: PIXI.Text;
    characterSubtitle: PIXI.Text;
    key: string;
    isPlaying: boolean;
    keyQueue: any[];
    isPaused: boolean;
    currentHowl: Howl;
    currentSoundId: any;
    keyStartTime: number;
    nextLineAt: number;
    lineIndex: number;
    lines: any[];
    duration: number;
    constructor(filesToHowl: Map<string, Howl>, narrationTable: any);
    setup(config: any): void;
    update(options: {
        playTime: number;
        timeScale: number;
        gameState: any;
    }): void;
    teardown(): void;
    changeKey(key: string, priority?: number): void;
    cancelAll(): void;
    narrationDuration(key: string): number;
    onSignal(signal: string, data?: any): void;
    _initNarration(playTime: number): void;
    _updateText(text?: string, speaker?: any): void;
    _updateNextLineAt(): void;
    _updateMuted(): void;
    _updateShowSubtitles(): void;
}
export declare class SpeakerDisplay extends entity.Entity {
    namesToImages: {
        [name: string]: string;
    };
    position: PIXI.Point;
    container: PIXI.Container;
    namesToSprites: {
        [name: string]: PIXI.Sprite;
    };
    currentSpeakerName: any;
    constructor(namesToImages: {
        [name: string]: string;
    }, position?: PIXI.Point);
    setup(config: any): void;
    teardown(): void;
    _onChangeSpeaker(speaker?: any): void;
}
export declare class SingleNarration extends entity.Entity {
    narrationKey: string;
    priority: number;
    constructor(narrationKey: string, priority?: number);
    _setup(): void;
    _onNarrationDone(key?: string): void;
    _teardown(): void;
}
export declare class RandomNarration extends entity.Entity {
    narrationKeys: string[];
    priority: number;
    narrationPlaylist: any[];
    currentKey: string;
    constructor(narrationKeys: string[], priority: number);
    setup(config: any): void;
    _update(options: any): void;
    teardown(): void;
}
/**
  Launches a complete video scene, complete with a video, narration, music, and skip button.
  Terminates when either the video completes, or the skip button is pressed.
 */
export declare class VideoScene extends entity.ParallelEntity {
    options: any;
    narration: SingleNarration;
    video: entity.VideoEntity;
    skipButton: entity.SkipButton;
    previousMusic: string;
    constructor(options?: any);
    _setup(config: any): void;
    _update(options: any): void;
    _teardown(): void;
}
export declare function makeNarrationKeyList(prefix: number, count: number): number[];
export declare function loadNarrationAudio(narrationTable: any, languageCode: string): Map<any, any>;
export declare function loadScript(languageCode: string): Promise<unknown>;
export declare function makeNarrationLoader(narrationTable: any, languageCode: string): Promise<void | unknown[]>;
export declare function breakDialogIntoLines(text: string): {
    speaker: string;
    text: string;
    start: string;
}[];
export declare function estimateDuration(text: string, timePerWord?: number): number;
