import * as util from "./util.js";
import * as entity from "./entity.js";


export const AUDIO_FILE_FORMATS = ["mp3"];


/** 
  A music player, that only plays one track at a time.
  By default the volume is lowered to not interere with sound effects.
*/
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

    _.each(this.namesToHowl, howl => {
      howl.volume(this.volume);
      howl.loop(true);
    });
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
    if(this.stopOnTeardown) {
      this.config.jukebox.changeMusic();
    }
  }
}

/** 
  Play sounds effects.
*/
export class FxMachine extends entity.Entity {
  // Options include { muted: false, volume: 0.25 }
  constructor(namesToHowl, options) {
    super();

    this.namesToHowl = namesToHowl;

    _.defaults(options, {
      muted: false,
      volume: 1,
    });

    this.muted = options.muted;
    this.volume = options.volume;

    _.each(this.namesToHowl, howl => howl.volume(this.volume))
    this._updateMuted();
  }

  play(name) {
    this.namesToHowl[name].play();
  }

  // TODO: stop playing effects when muted or paused

  // onSignal(signal, data = null) {
  //   super.onSignal(signal, data);

  //   if(signal === "pause") this.musicPlaying.pause();
  //   else if(signal === "play") this.musicPlaying.play();
  // }

  setMuted(isMuted) {
    this.muted = isMuted;
    this._updateMuted();
  }

  _updateMuted() {
    _.each(this.namesToHowl, howl => howl.mute(this.muted))
  }
} 

/** Creates a Promise from the Howl callbacks used for loading */ 
export function makeHowlerLoadPromise(howl) {
  return new Promise((resolve, reject) => {
    howl.on("load", () => resolve(howl))
    howl.on("loaderror", (id, err) => reject(howl, id, err));
  });
}

/** Create map of file names to Howl objects */
export function makeHowls(directory, fileNames) {
  const fileToHowl = {};
  for(let file of fileNames) {
    fileToHowl[file] = new Howl({
      src: _.map(AUDIO_FILE_FORMATS, (audioFormat) => `audio/${directory}/${file}.${audioFormat}`),
    });
  }
  return fileToHowl;
}

