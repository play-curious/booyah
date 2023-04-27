import { sound } from "@pixi/sound";

import * as chip from "booyah/src/chip";

export class JukeboxOptions {
  volume = 0.5;
}

/** 
  A music player, that only plays one track at a time.
  By default the volume is lowered to not interfere with sound effects.
*/
export class Jukebox extends chip.ChipBase {
  private _options: JukeboxOptions;
  private _volume: number;
  private _musicName?: string;

  constructor(options?: Partial<JukeboxOptions>) {
    super();

    this._options = chip.fillInOptions(options, new JukeboxOptions());
  }

  protected _onActivate(): void {
    this._volume = this._options.volume;
  }

  _onTerminate() {
    if (this._musicName) sound.stop(this._musicName);

    delete this._musicName;
  }

  protected _onPause(): void {
    if (this._musicName) sound.pause(this._musicName);
  }

  protected _onResume(): void {
    if (this._musicName) sound.resume(this._musicName);
  }

  pauseMusic(): void {
    if (this._musicName) sound.pause(this._musicName);
  }

  resumeMusic(): void {
    if (this._musicName) sound.resume(this._musicName);
  }

  get volume(): number {
    return this._volume;
  }

  set volume(value: number) {
    this._volume = value;
    if (this._musicName) sound.volume(this._musicName, value);
  }

  play(name: string) {
    if (this._musicName === name) return;

    this.stop();

    sound.play(name, {
      volume: this._volume,
      loop: true,
    });
  }

  stop() {
    if (!this._musicName) return;

    sound.stop(this._musicName);
    delete this._musicName;
  }
}

/**
  A chip that requests the music be changed upon activate.
  Optionally can stop the music on terminate.
*/
export class MusicChip extends chip.ChipBase {
  constructor(public trackName: string, public stopOnTeardown = false) {
    super();
  }

  _onActivate() {
    this._chipContext.jukebox.play(this.trackName);
    this.terminate();
  }

  _onTerminate() {
    if (this.stopOnTeardown) {
      this._chipContext.jukebox.stop();
    }
  }
}

export class FxMachineOptions {
  volume = 1;
}

class PlayingSoundOptions {
  volumeScale = 1;
  loop = false;
}

/**
  Play sounds effects.
*/
export class FxMachine extends chip.ChipBase {
  private _options: FxMachineOptions;
  private _volume: number;
  private _playingSounds: Record<string, PlayingSoundOptions>;

  constructor(options?: Partial<FxMachineOptions>) {
    super();

    this._options = chip.fillInOptions(options, new FxMachineOptions());
  }

  _onActivate() {
    this._volume = this._options.volume;
    this._playingSounds = {};
  }

  protected _onTerminate(): void {
    this.stopAll();
  }

  /** Returns sound duration in ms */
  getDuration(name: string): number {
    return sound.duration(name) * 1000;
  }

  play(name: string, options?: Partial<PlayingSoundOptions>) {
    if (!sound.exists(name)) throw new Error(`Missing sound effect ${name}`);

    const completeOptions = chip.fillInOptions(
      options,
      new PlayingSoundOptions()
    );

    sound.play(name, {
      volume: this._volume * completeOptions.volumeScale,
      loop: completeOptions.loop,
      complete: () => {
        delete this._playingSounds[name];
        this.emit("complete", name);
      },
    });

    this._playingSounds[name] = completeOptions;
  }

  stop(name: string): void {
    sound.stop(name);
    delete this._playingSounds[name];
  }

  stopAll(): void {
    for (const name in this._playingSounds) {
      this.stop(name);
    }
  }

  pauseSound(name: string): void {
    sound.pause(name);
  }

  pauseAll(): void {
    // console.log("Pausing all sounds", this._playingSounds);
    for (const name in this._playingSounds) {
      this.pauseSound(name);
    }
  }

  resumeSound(name: string): void {
    sound.resume(name);
  }

  resumeAll(): void {
    for (const name in this._playingSounds) {
      this.resumeSound(name);
    }
  }

  protected _onPause(): void {
    sound.pauseAll();
  }

  protected _onResume(): void {
    sound.resumeAll();
  }

  get volume(): number {
    return this._volume;
  }

  set volume(value: number) {
    this._volume = value;

    for (const name in this._playingSounds) {
      sound.volume(name, value);
    }
  }
}

// export function installFxMachine(rootConfig: any, rootChip: any) {
//   rootConfig.fxMachine = new FxMachine();
//   rootChip.addChildChip(rootConfig.fxMachine);
// }

// export function makeInstallFxMachine(options: FxMachineOptions) {
//   return (rootConfig: chip.ChipContext, rootChip: chip.Parallel) => {
//     rootConfig.fxMachine = new FxMachine(options);
//     rootChip.addChildChip(rootConfig.fxMachine);
//   };
// }

// /** Creates a Promise from the Howl callbacks used for loading */

// export function makeHowlerLoadPromise(howl: Howl) {
//   return new Promise((resolve, reject) => {
//     howl.on("load", () => resolve(howl));
//     howl.on("loaderror", (id, err) => reject({ howl, id, err }));
//   });
// }

// /** Create map of file names or {key, url} to Howl objects */
// export function makeHowls(
//   directory: string,
//   assetDescriptions: (string | { key: string; url: string })[]
// ) {
//   const assets: { [key: string]: Howl } = {};
//   for (const assetDescription of assetDescriptions) {
//     if (_.isString(assetDescription)) {
//       assets[assetDescription] = new Howl({
//         src: assetDescription,
//       });
//     } else {
//       const url = assetDescription.url;
//       assets[assetDescription.key] = new Howl({
//         src: assetDescription.url,
//       });
//     }
//   }
//   return assets;
// }
