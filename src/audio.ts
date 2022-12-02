import * as util from "./util";
import * as entity from "./entity";
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
export class Jukebox extends entity.EntityBase {
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

  _setup() {
    this.musicName = null;
    this.musicPlaying = null;

    _.each(this._entityConfig.musicAudio, (howl: Howl) => {
      howl.loop(true);
    });

    this.muted = this._entityConfig.muted;
    this._updateMuted();

    this._on(this._entityConfig.playOptions, "musicOn", this._updateMuted);
  }

  _teardown() {
    if (this.musicPlaying) this.musicPlaying.stop();
    this.musicPlaying = null;
    this.musicName = null;
  }

  _onSignal(frameInfo: entity.FrameInfo, signal: string, data?: any) {
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

    if (!(name in this._entityConfig.musicAudio)) {
      console.error("Missing music", name);
      return;
    }

    if (name) {
      this.musicName = name;
      this.musicPlaying = this._entityConfig.musicAudio[name];
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
    const muted = !this._entityConfig.playOptions.options.musicOn;
    _.each(this._entityConfig.musicAudio, (howl: Howl) => howl.mute(muted));
  }
}

export function installJukebox(
  rootConfig: entity.EntityConfig,
  rootEntity: entity.ParallelEntity
) {
  rootConfig.jukebox = new Jukebox();
  rootEntity.addChildEntity(rootConfig.jukebox);
}

export function makeInstallJukebox(options: JukeboxOptions) {
  return (
    rootConfig: entity.EntityConfig,
    rootEntity: entity.ParallelEntity
  ) => {
    rootConfig.jukebox = new Jukebox(options);
    rootEntity.addChildEntity(rootConfig.jukebox);
  };
}

/** 
  Am entity that requests the music be changed upon setup.
  Optionally can stop the music on teardown.
*/
export class MusicEntity extends entity.EntityBase {
  constructor(public trackName: string, public stopOnTeardown = false) {
    super();
  }

  _setup(frameInfo: entity.FrameInfo, entityConfig: entity.EntityConfig) {
    this._entityConfig.jukebox.play(this.trackName);

    this._transition = entity.makeTransition();
  }

  _teardown() {
    if (this.stopOnTeardown) {
      this._entityConfig.jukebox.play();
    }
  }
}

export class FxMachineOptions {
  volume = 1;
}

/** 
  Play sounds effects.
*/
export class FxMachine extends entity.EntityBase {
  private _volume: number;

  private _playingSounds: Record<string, { volumeScale: number }>;

  constructor(options?: Partial<FxMachineOptions>) {
    super();

    const _options = util.fillInOptions(options, new FxMachineOptions());
    this._volume = _options.volume;
  }

  _setup() {
    this.changeVolume(this._volume);

    this._updateMuted();

    this._on(this._entityConfig.playOptions, "fxOn", this._updateMuted);

    this._playingSounds = {};
    for (const name in this._entityConfig.fxAudio) {
      const howl = this._entityConfig.fxAudio[name];

      // The Howl.on() function doesn't take the same arguments as the event emitter, so we don't use this._on()
      howl.on("end", () => {
        delete this._playingSounds[name];
      });
    }
  }

  protected _teardown(frameInfo: entity.FrameInfo): void {
    this.stopAll();
  }

  changeVolume(volume: number) {
    this._volume = volume;
    for (const name in this._playingSounds) {
      const howl = this._entityConfig.fxAudio[name];
      howl.volume(volume * this._playingSounds[name].volumeScale);
    }
  }

  /** Returns sound duration in ms */
  getDuration(name: string): number {
    return this._entityConfig.fxAudio[name].duration() * 1000;
  }

  play(name: string, volumeScale = 1) {
    if (!(name in this._entityConfig.fxAudio)) {
      console.error("Missing sound effect", name);
      return;
    }

    const howl = this._entityConfig.fxAudio[name];
    howl.volume(this._volume * volumeScale);
    howl.play();
    this._playingSounds[name] = { volumeScale };
  }

  stop(name: string): void {
    this._entityConfig.Audio[name].stop();
  }

  pause(name: string): void {
    this._entityConfig.Audio[name].pause();
  }

  pauseAll(): void {
    for (const name in this._playingSounds) {
      const howl = this._entityConfig.fxAudio[name];
      howl.pause();
    }
  }

  resume(name: string): void {
    this._entityConfig.Audio[name].play();
  }

  resumeAll(): void {
    for (const name in this._playingSounds) {
      const howl = this._entityConfig.fxAudio[name];
      howl.play();
    }
  }

  // TODO: stop playing effects when paused
  protected _onSignal(
    frameInfo: entity.FrameInfo,
    signal: string,
    data?: any
  ): void {
    if (signal === "pause") this.pauseAll();
    if (signal === "play") this.resumeAll();
  }

  _updateMuted() {
    const muted = !this._entityConfig.playOptions.options.fxOn;
    _.each(this._entityConfig.fxAudio, (howl: Howl) => howl.mute(muted));
  }

  stopAll(): void {
    _.each(this._entityConfig.fxAudio, (howl: Howl) => howl.stop());
  }
}

export function installFxMachine(rootConfig: any, rootEntity: any) {
  rootConfig.fxMachine = new FxMachine();
  rootEntity.addChildEntity(rootConfig.fxMachine);
}

export function makeInstallFxMachine(options: FxMachineOptions) {
  return (
    rootConfig: entity.EntityConfig,
    rootEntity: entity.ParallelEntity
  ) => {
    rootConfig.fxMachine = new FxMachine(options);
    rootEntity.addChildEntity(rootConfig.fxMachine);
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
