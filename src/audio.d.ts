/// <reference types="howler" />
import * as entity from "./entity";
import {Config, Options, Entity} from "../typescript/entity";
export declare const AUDIO_FILE_FORMATS: string[];
/**
  A music player, that only plays one track at a time.
  By default the volume is lowered to not interere with sound effects.
*/
export declare class Jukebox extends entity.Entity {
    volume: number;
    musicName: string;
    musicPlaying: MusicEntity;
    muted: boolean;
    constructor(options?: Options);
    _setup(config: boolean): void;
    _teardown(): void;
    _onSignal(signal: string, data?: any): void;
    changeMusic(name?: string): void;
    setMuted(isMuted: boolean): void;
    _updateMuted(): void;
}
export declare function installJukebox(rootConfig: Config, rootEntity: Entity): void;
export declare function makeInstallJukebox(options?: Options): (rootConfig: Config, rootEntity: Entity) => void;
/**
  Am entity that requests the music be changed upon setup.
  Optionally can stop the music on teardown.
*/
export declare class MusicEntity extends entity.Entity {
    trackName: string;
    stopOnTeardown: boolean;
    constructor(trackName: string, stopOnTeardown?: boolean);
    _setup(config: Config): void;
    _teardown(): void;
}
/**
  Play sounds effects.
*/
export declare class FxMachine extends entity.Entity {
    volume: number;
    constructor(options?: Options);
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
