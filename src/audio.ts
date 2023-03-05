import * as util from "./util";
import * as chip from "./chip";
import { Howl, Howler } from "howler";
import _ from "underscore";

export const AUDIO_FILE_FORMATS = ["mp3"];

export interface JukeboxOptions {
  volume?: number;
}

/** 
  A music player, that only plays one track at a time.
  By default the volume is lowered to not interfere with sound effects.
*/
export class Jukebox extends chip.ChipBase {
  public volume: number;
  public musicName: string;
  public musicPlaying: Howl;
  public muted: boolean;

  constructor(options: JukeboxOptions = {}) {
    super();

    util.setupOptions(this, options, {
      volume: 0.25,
    });
  }

  _onActivate() {
    this.musicName = null;
    this.musicPlaying = null;

    _.each(this._chipConfig.musicAudio, (howl: Howl) => {
      howl.loop(true);
    });

    this.muted = this._chipConfig.muted;
    this._updateMuted();

    this._on(this._chipConfig.playOptions, "musicOn", this._updateMuted);
  }

  _onTerminate() {
    if (this.musicPlaying) this.musicPlaying.stop();
    this.musicPlaying = null;
    this.musicName = null;
  }

  _onSignal(frameInfo: chip.FrameInfo, signal: string, data?: any) {
    if (!this.musicPlaying) return;

    if (signal === "pause") this.musicPlaying.pause();
    else if (signal === "play") this.musicPlaying.play();
    else if (signal === "reset") this.play();
  }

  changeVolume(volume: number) {
    this.volume = volume;
    if (this.musicPlaying) this.musicPlaying.volume(volume);
  }

  play(name?: string, volume?: number) {
    if (this.musicPlaying && this.musicName === name) return;

    if (this.musicPlaying) {
      // TODO: fade
      this.musicPlaying.stop();
      this.musicPlaying = null;
    }

    // If no new music is requested, stop
    if (!name) return;

    if (!(name in this._chipConfig.musicAudio)) {
      console.error("Missing music", name);
      return;
    }

    if (name) {
      this.musicName = name;
      this.musicPlaying = this._chipConfig.musicAudio[name];
      this.musicPlaying.volume(volume ?? this.volume);
      this.musicPlaying.play();
    }
  }

  stop() {
    this.play();
  }

  setMuted(isMuted: boolean) {
    this.muted = isMuted;
    this._updateMuted();
  }

  _updateMuted() {
    const muted = !this._chipConfig.playOptions.options.musicOn;
    _.each(this._chipConfig.musicAudio, (howl: Howl) => howl.mute(muted));
  }
}

export function installJukebox(
  rootConfig: chip.ChipConfig,
  rootChip: chip.ParallelChip
) {
  rootConfig.jukebox = new Jukebox();
  rootChip.addChildChip(rootConfig.jukebox);
}

export function makeInstallJukebox(options: JukeboxOptions) {
  return (rootConfig: chip.ChipConfig, rootChip: chip.ParallelChip) => {
    rootConfig.jukebox = new Jukebox(options);
    rootChip.addChildChip(rootConfig.jukebox);
  };
}

/** 
  Am chip that requests the music be changed upon activate.
  Optionally can stop the music on terminate.
*/
export class MusicChip extends chip.ChipBase {
  constructor(public trackName: string, public stopOnTeardown = false) {
    super();
  }

  _onActivate(frameInfo: chip.FrameInfo, chipConfig: chip.ChipConfig) {
    this._chipConfig.jukebox.play(this.trackName);

    this._transition = chip.makeTransition();
  }

  _onTerminate() {
    if (this.stopOnTeardown) {
      this._chipConfig.jukebox.play();
    }
  }
}

export class FxMachineOptions {
  volume = 1;
}

/** 
  Play sounds effects.
*/
export class FxMachine extends chip.ChipBase {
  private _volume: number;

  private _playingSounds: Record<string, { volumeScale: number }>;

  constructor(options?: Partial<FxMachineOptions>) {
    super();

    const _options = util.fillInOptions(options, new FxMachineOptions());
    this._volume = _options.volume;
  }

  _onActivate() {
    this.changeVolume(this._volume);

    this._updateMuted();

    this._on(this._chipConfig.playOptions, "fxOn", this._updateMuted);

    this._playingSounds = {};
    for (const name in this._chipConfig.fxAudio) {
      const howl = this._chipConfig.fxAudio[name];

      // The Howl.on() function doesn't take the same arguments as the event emitter, so we don't use this._on()
      howl.on("end", () => {
        // console.log("fx ended", name);

        // A sound can be looping, so don't remove it from our list until it is really done
        if (howl.playing()) return;

        delete this._playingSounds[name];
      });
    }
  }

  protected _onTerminate(frameInfo: chip.FrameInfo): void {
    this.stopAll();
  }

  changeVolume(volume: number) {
    this._volume = volume;
    for (const name in this._playingSounds) {
      const howl = this._chipConfig.fxAudio[name];
      howl.volume(volume * this._playingSounds[name].volumeScale);
    }
  }

  /** Returns sound duration in ms */
  getDuration(name: string): number {
    return this._chipConfig.fxAudio[name].duration() * 1000;
  }

  play(name: string, options = { volumeScale: 1, loop: false }) {
    if (!(name in this._chipConfig.fxAudio)) {
      console.error("Missing sound effect", name);
      return;
    }

    // console.log("fx playing", name);

    const howl = this._chipConfig.fxAudio[name];
    howl.volume(this._volume * options.volumeScale);
    howl.loop(options.loop);
    howl.play();
    this._playingSounds[name] = { volumeScale: options.volumeScale };
  }

  stop(name: string): void {
    this._chipConfig.fxAudio[name].stop();
    delete this._playingSounds[name];
  }

  stopAll(): void {
    for (const name in this._playingSounds) {
      this.stop(name);
    }
  }

  pause(name: string): void {
    this._chipConfig.fxAudio[name].pause();
  }

  pauseAll(): void {
    // console.log("Pausing all sounds", this._playingSounds);
    for (const name in this._playingSounds) {
      this.pause(name);
    }
  }

  resume(name: string): void {
    this._chipConfig.fxAudio[name].play();
  }

  resumeAll(): void {
    for (const name in this._playingSounds) {
      this.resume(name);
    }
  }

  // TODO: stop playing effects when paused
  protected _onSignal(
    frameInfo: chip.FrameInfo,
    signal: string,
    data?: any
  ): void {
    if (signal === "pause") this.pauseAll();
    if (signal === "play") this.resumeAll();
  }

  _updateMuted() {
    const muted = !this._chipConfig.playOptions.options.fxOn;
    _.each(this._chipConfig.fxAudio, (howl: Howl) => howl.mute(muted));
  }
}

export function installFxMachine(rootConfig: any, rootChip: any) {
  rootConfig.fxMachine = new FxMachine();
  rootChip.addChildChip(rootConfig.fxMachine);
}

export function makeInstallFxMachine(options: FxMachineOptions) {
  return (rootConfig: chip.ChipConfig, rootChip: chip.ParallelChip) => {
    rootConfig.fxMachine = new FxMachine(options);
    rootChip.addChildChip(rootConfig.fxMachine);
  };
}

/** Creates a Promise from the Howl callbacks used for loading */

export function makeHowlerLoadPromise(howl: Howl) {
  return new Promise((resolve, reject) => {
    howl.on("load", () => resolve(howl));
    howl.on("loaderror", (id, err) => reject({ howl, id, err }));
  });
}

/** Create map of file names or {key, url} to Howl objects */
export function makeHowls(
  directory: string,
  assetDescriptions: (string | { key: string; url: string })[]
) {
  const assets: { [key: string]: Howl } = {};
  for (const assetDescription of assetDescriptions) {
    if (_.isString(assetDescription)) {
      assets[assetDescription] = new Howl({
        src: assetDescription,
      });
    } else {
      const url = assetDescription.url;
      assets[assetDescription.key] = new Howl({
        src: assetDescription.url,
      });
    }
  }
  return assets;
}
