/// <reference types="howler" />
import * as entity from "./entity";
export declare const AUDIO_FILE_FORMATS: string[];
export interface JukeboxOptions {
    volume?: number;
}
/**
  A music player, that only plays one track at a time.
  By default the volume is lowered to not interere with sound effects.
*/
export declare class Jukebox extends entity.Entity {
    volume: number;
    musicName: string;
    musicPlaying: any;
    muted: boolean;
    constructor(options?: JukeboxOptions);
    _setup(config: entity.EntityConfig): void;
    _teardown(): void;
    _onSignal(signal: string, data?: any): void;
    changeMusic(name?: string): void;
    setMuted(isMuted: boolean): void;
    _updateMuted(): void;
}
export declare function installJukebox(rootConfig: entity.EntityConfig, rootEntity: entity.ParallelEntity): void;
export declare function makeInstallJukebox(options: JukeboxOptions): (rootConfig: entity.EntityConfig, rootEntity: entity.ParallelEntity) => void;
/**
  Am entity that requests the music be changed upon setup.
  Optionally can stop the music on teardown.
*/
export declare class MusicEntity extends entity.Entity {
    trackName: string;
    stopOnTeardown: boolean;
    constructor(trackName: string, stopOnTeardown?: boolean);
    _setup(config: entity.EntityConfig): void;
    _teardown(): void;
}
/**
  Play sounds effects.
*/
export declare class FxMachine extends entity.Entity {
    volume: number;
    constructor(options?: any);
    _setup(): void;
    play(name: string): void;
    _updateMuted(): void;
}
export declare function installFxMachine(rootConfig: any, rootEntity: any): void;
/** Creates a Promise from the Howl callbacks used for loading */
export declare function makeHowlerLoadPromise(howl: Howl): Promise<unknown>;
/** Create map of file names or {key, url} to Howl objects */
export declare function makeHowls(directory: string, assetDescriptions: (string | {
    key: string;
    url: string;
})[]): {
    [key: string]: Howl;
};
