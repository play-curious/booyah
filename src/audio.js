import * as util from "./util.js";
import * as entity from "./entity.js";

export const AUDIO_FILE_FORMATS = ["mp3"];

/** 
  A music player, that only plays one track at a time.
  By default the volume is lowered to not interere with sound effects.
*/
export class Jukebox extends entity.Entity {
  // Options include { volume: 0.25 }
  constructor(options) {
    super();

    util.setupOptions(this, options, {
      volume: 0.25
    });
  }

  _setup(config) {
    this.musicPlaying = null;

    _.each(this.config.musicAudio, howl => {
      howl.volume(this.volume);
      howl.loop(true);
    });

    this.muted = this.config;
    this._updateMuted();

    this._on(this.config.playOptions, "musicOn", this._updateMuted);
  }

  _teardown() {
    if (this.musicPlaying) this.musicPlaying.stop();
  }

  _onSignal(signal, data = null) {
    if (!this.musicPlaying) return;

    if (signal === "pause") this.musicPlaying.pause();
    else if (signal === "play") this.musicPlaying.play();
    else if (signal === "reset") this.changeMusic();
  }

  changeMusic(name = null) {
    if (this.musicPlaying) {
      // TODO: fade
      this.musicPlaying.stop();
      this.musicPlaying = null;
    }

    if (name) {
      this.musicPlaying = this.config.musicAudio[name];
      this.musicPlaying.play();
    }
  }

  setMuted(isMuted) {
    this.muted = isMuted;
    this._updateMuted();
  }

  _updateMuted() {
    const muted = !this.config.playOptions.options.musicOn;
    _.each(this.config.musicAudio, howl => howl.mute(muted));
  }
}

export function installJukebox(rootConfig, rootEntity) {
  rootConfig.jukebox = new Jukebox();
  rootEntity.addEntity(rootConfig.jukebox);
}

/** 
  Am entity that requests the music be changed upon setup.
  Optionally can stop the music on teardown.
*/
export class MusicEntity extends entity.Entity {
  constructor(trackName, stopOnTeardown = false) {
    super();

    this.trackName = trackName;
    this.stopOnTeardown = stopOnTeardown;
  }

  _setup(config) {
    this.config.jukebox.changeMusic(this.trackName);

    this.requestedTransition = true;
  }

  _teardown() {
    if (this.stopOnTeardown) {
      this.config.jukebox.changeMusic();
    }
  }
}

/** 
  Play sounds effects.
*/
export class FxMachine extends entity.Entity {
  // Options include { volume: 1 }
  constructor(options) {
    super();

    util.setupOptions(this, options, {
      volume: 1
    });
  }

  _setup() {
    _.each(this.config.fxAudio, howl => howl.volume(this.volume));
    this._updateMuted();

    this._on(this.config.playOptions, "fxOn", this._updateMuted);
  }

  play(name) {
    this.config.fxAudio[name].play();
  }

  // TODO: stop playing effects when paused or on teardown

  // onSignal(signal, data = null) {
  //   super.onSignal(signal, data);

  //   if(signal === "pause") this.musicPlaying.pause();
  //   else if(signal === "play") this.musicPlaying.play();
  // }

  _updateMuted() {
    const muted = !this.config.playOptions.options.fxOn;
    _.each(this.config.fxAudio, howl => howl.mute(muted));
  }
}

export function installFxMachine(rootConfig, rootEntity) {
  rootConfig.fxMachine = new FxMachine();
  rootEntity.addEntity(rootConfig.fxMachine);
}

/** Creates a Promise from the Howl callbacks used for loading */

export function makeHowlerLoadPromise(howl) {
  return new Promise((resolve, reject) => {
    howl.on("load", () => resolve(howl));
    howl.on("loaderror", (id, err) => reject(howl, id, err));
  });
}

/** Create map of file names to Howl objects */
export function makeHowls(directory, fileNames) {
  const fileToHowl = {};
  for (let file of fileNames) {
    fileToHowl[file] = new Howl({
      src: _.map(
        AUDIO_FILE_FORMATS,
        audioFormat => `audio/${directory}/${file}.${audioFormat}`
      )
    });
  }
  return fileToHowl;
}
