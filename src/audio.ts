import * as util from "./util";
import * as entity from "./entity";
import _ from "underscore";
import { FrameInfo } from "./entity";

export const AUDIO_FILE_FORMATS = ["mp3"];

export interface JukeboxOptions {
  volume?: number;
}

/** 
  A music player, that only plays one track at a time.
  By default the volume is lowered to not interere with sound effects.
*/
export class Jukebox extends entity.Entity {
  public volume: number;
  public musicName: string;
  public musicPlaying: any;
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

    _.each(this.entityConfig.musicAudio, (howl: Howl) => {
      howl.volume(this.volume);
      howl.loop(true);
    });

    this.muted = this.entityConfig.muted;
    this._updateMuted();

    this._on(this.entityConfig.playOptions, "musicOn", this._updateMuted);
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
    else if (signal === "reset") this.changeMusic();
  }

  changeMusic(name?: string) {
    if (this.musicPlaying) {
      // TODO: fade
      this.musicPlaying.stop();
      this.musicPlaying = null;
    }

    if (name) {
      this.musicName = name;
      this.musicPlaying = this.entityConfig.musicAudio[name];
      this.musicPlaying.play();
    }
  }

  setMuted(isMuted: boolean) {
    this.muted = isMuted;
    this._updateMuted();
  }

  _updateMuted() {
    const muted = !this.entityConfig.playOptions.options.musicOn;
    _.each(this.entityConfig.musicAudio, (howl: Howl) => howl.mute(muted));
  }
}

export function installJukebox(
  rootConfig: entity.EntityConfig,
  rootEntity: entity.ParallelEntity
) {
  rootConfig.jukebox = new Jukebox();
  rootEntity.addEntity(rootConfig.jukebox);
}

export function makeInstallJukebox(options: JukeboxOptions) {
  return (
    rootConfig: entity.EntityConfig,
    rootEntity: entity.ParallelEntity
  ) => {
    rootConfig.jukebox = new Jukebox(options);
    rootEntity.addEntity(rootConfig.jukebox);
  };
}

/** 
  Am entity that requests the music be changed upon setup.
  Optionally can stop the music on teardown.
*/
export class MusicEntity extends entity.Entity {
  constructor(public trackName: string, public stopOnTeardown = false) {
    super();
  }

  _setup(frameInfo: FrameInfo, entityConfig: entity.EntityConfig) {
    this.entityConfig.jukebox.changeMusic(this.trackName);

    this.requestedTransition = true;
  }

  _teardown() {
    if (this.stopOnTeardown) {
      this.entityConfig.jukebox.changeMusic();
    }
  }
}

/** 
  Play sounds effects.
*/
export class FxMachine extends entity.Entity {
  public volume: number;

  constructor(options: any = {}) {
    super();

    util.setupOptions(this, options, {
      volume: 1,
    });
  }

  _setup() {
    _.each(this.entityConfig.fxAudio, (howl: Howl) => howl.volume(this.volume));
    this._updateMuted();

    this._on(this.entityConfig.playOptions, "fxOn", this._updateMuted);
  }

  play(name: string) {
    this.entityConfig.fxAudio[name].play();
  }

  // TODO: stop playing effects when paused or on teardown

  // onSignal(signal:string, data?:any) {
  //   super.onSignal(signal, data);

  //   if(signal === "pause") this.musicPlaying.pause();
  //   else if(signal === "play") this.musicPlaying.play();
  // }

  _updateMuted() {
    const muted = !this.entityConfig.playOptions.options.fxOn;
    _.each(this.entityConfig.fxAudio, (howl: Howl) => howl.mute(muted));
  }
}

export function installFxMachine(rootConfig: any, rootEntity: any) {
  rootConfig.fxMachine = new FxMachine();
  rootEntity.addEntity(rootConfig.fxMachine);
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
  for (let assetDescription of assetDescriptions) {
    if (_.isString(assetDescription)) {
      assets[assetDescription] = new Howl({
        src: _.map(
          AUDIO_FILE_FORMATS,
          (audioFormat) =>
            `audio/${directory}/${assetDescription}.${audioFormat}`
        ),
      });
    } else {
      const url = assetDescription.url;
      assets[assetDescription.key] = new Howl({
        src: _.map(
          AUDIO_FILE_FORMATS,
          (audioFormat) => `audio/${directory}/${url}.${audioFormat}`
        ),
      });
    }
  }
  return assets;
}
