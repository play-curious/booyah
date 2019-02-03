import * as util from "./util.js";
import * as entity from "./entity.js";


export const AUDIO_FILE_FORMATS = ["mp3"];


export class Jukebox extends entity.Entity {
  // Options include { muted: false, volume: 0.25 }
  constructor(namesToHowl, options) {
    super();

    this.namesToHowl = namesToHowl;

    _.defaults(options, {
      muted: false,
      volume: 0.25,
    });

    this.muted = options.muted;
    this.volume = options.volume;

    _.each(this.namesToHowl, howl => howl.volume(this.volume))
    this._updateMuted();
  }

  setup(config) {
    super.setup(config);

    this.musicPlaying = null;
  }

  changeMusic(name = null) {
    if(this.musicPlaying) {
      // TODO: fade
      this.musicPlaying.stop();
      this.musicPlaying = null;
    }

    if(name) {
      this.musicPlaying = this.namesToHowl[name];
      this.musicPlaying.play();
    }
  }

  teardown() {
    super.teardown();

    if(this.musicPlaying) this.musicPlaying.stop();
  }

  onSignal(signal, data = null) {
    super.onSignal(signal, data);

    if(!this.musicPlaying) return;

    if(signal === "pause") this.musicPlaying.pause();
    else if(signal === "play") this.musicPlaying.play();
  }

  setMuted(isMuted) {
    this.muted = isMuted;
    this._updateMuted();
  }

  _updateMuted() {
    _.each(this.namesToHowl, howl => howl.mute(this.muted))
  }
} 

export class MusicEntity extends entity.Entity {
  constructor(trackName, stopOnTeardown = false) {
    super();

    this.trackName = trackName;
    this.stopOnTeardown = stopOnTeardown;
  }

  setup(config) {
    super.setup(config);

    this.config.jukebox.changeMusic(this.trackName);
  }

  teardown() {
    if(this.stopOnTeardown) {
      this.config.jukebox.changeMusic();
    }
  }
}


export function makeHowlerLoadPromise(howl) {
  return new Promise((resolve, reject) => {
    howl.on("load", () => resolve(howl))
    howl.on("loaderror", (id, err) => reject(howl, id, err));
  });
}

export function makeMusicHowls(fileNames) {
  // Create map of file names to Howl objects
  const fileToHowl = {};
  for(let file of fileNames) {
    fileToHowl[file] = new Howl({
      src: _.map(AUDIO_FILE_FORMATS, (audioFormat) => `audio/music/${file}.${audioFormat}`),
      loop: true,
    });
  }
  return fileToHowl;
}

