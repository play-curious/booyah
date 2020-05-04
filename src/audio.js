import * as util from "./util";
import * as entity from "./entity";
import { Howl } from "howler";
import _ from "underscore";
export const AUDIO_FILE_FORMATS = ["mp3"];
/**
  A music player, that only plays one track at a time.
  By default the volume is lowered to not interere with sound effects.
*/
export class Jukebox extends entity.Entity {
    constructor(options = {}) {
        super();
        util.setupOptions(this, options, {
            volume: 0.25
        });
    }
    _setup(config) {
        this.musicName = null;
        this.musicPlaying = null;
        _.each(this.config.musicAudio, (howl) => {
            howl.volume(this.volume);
            howl.loop(true);
        });
        this.muted = this.config;
        this._updateMuted();
        this._on(this.config.playOptions, "musicOn", this._updateMuted);
    }
    _teardown() {
        if (this.musicPlaying)
            this.musicPlaying.stop();
        this.musicPlaying = null;
        this.musicName = null;
    }
    _onSignal(signal, data) {
        if (!this.musicPlaying)
            return;
        if (signal === "pause")
            this.musicPlaying.pause();
        else if (signal === "play")
            this.musicPlaying.play();
        else if (signal === "reset")
            this.changeMusic();
    }
    changeMusic(name) {
        if (this.musicPlaying) {
            // TODO: fade
            this.musicPlaying.stop();
            this.musicPlaying = null;
        }
        if (name) {
            this.musicName = name;
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
        _.each(this.config.musicAudio, (howl) => howl.mute(muted));
    }
}
export function installJukebox(rootConfig, rootEntity) {
    rootConfig.jukebox = new Jukebox();
    rootEntity.addEntity(rootConfig.jukebox);
}
export function makeInstallJukebox(options = {}) {
    return (rootConfig, rootEntity) => {
        rootConfig.jukebox = new Jukebox(options);
        rootEntity.addEntity(rootConfig.jukebox);
    };
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
    constructor(options = {}) {
        super();
        util.setupOptions(this, options, {
            volume: 1
        });
    }
    _setup() {
        _.each(this.config.fxAudio, (howl) => howl.volume(this.volume));
        this._updateMuted();
        this._on(this.config.playOptions, "fxOn", this._updateMuted);
    }
    play(name) {
        this.config.fxAudio[name].play();
    }
    // TODO: stop playing effects when paused or on teardown
    // onSignal(signal:string, data?:any) {
    //   super.onSignal(signal, data);
    //   if(signal === "pause") this.musicPlaying.pause();
    //   else if(signal === "play") this.musicPlaying.play();
    // }
    _updateMuted() {
        const muted = !this.config.playOptions.options.fxOn;
        _.each(this.config.fxAudio, (howl) => howl.mute(muted));
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
        howl.on("loaderror", (id, err) => reject({ howl, id, err }));
    });
}
/** Create map of file names or {key, url} to Howl objects */
export function makeHowls(directory, assetDescriptions) {
    const assets = {};
    for (let assetDescription of assetDescriptions) {
        if (_.isString(assetDescription)) {
            assets[assetDescription] = new Howl({
                src: _.map(AUDIO_FILE_FORMATS, audioFormat => `audio/${directory}/${assetDescription}.${audioFormat}`)
            });
        }
        else {
            const url = assetDescription.url;
            assets[assetDescription.key] = new Howl({
                src: _.map(AUDIO_FILE_FORMATS, audioFormat => `audio/${directory}/${url}.${audioFormat}`)
            });
        }
    }
    return assets;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXVkaW8uanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi90eXBlc2NyaXB0L2F1ZGlvLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLE9BQU8sS0FBSyxJQUFJLE1BQU0sUUFBUSxDQUFDO0FBQy9CLE9BQU8sS0FBSyxNQUFNLE1BQU0sVUFBVSxDQUFDO0FBQ25DLE9BQU8sRUFBQyxJQUFJLEVBQUMsTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxDQUFDLE1BQU0sWUFBWSxDQUFDO0FBRTNCLE1BQU0sQ0FBQyxNQUFNLGtCQUFrQixHQUFHLENBQUMsS0FBSyxDQUFDLENBQUM7QUFFMUM7OztFQUdFO0FBQ0YsTUFBTSxPQUFPLE9BQVEsU0FBUSxNQUFNLENBQUMsTUFBTTtJQU94QyxZQUFZLFVBQWMsRUFBRTtRQUMxQixLQUFLLEVBQUUsQ0FBQztRQUVSLElBQUksQ0FBQyxZQUFZLENBQUMsSUFBSSxFQUFFLE9BQU8sRUFBRTtZQUMvQixNQUFNLEVBQUUsSUFBSTtTQUNiLENBQUMsQ0FBQztJQUNMLENBQUM7SUFFRCxNQUFNLENBQUMsTUFBYztRQUNuQixJQUFJLENBQUMsU0FBUyxHQUFHLElBQUksQ0FBQztRQUN0QixJQUFJLENBQUMsWUFBWSxHQUFHLElBQUksQ0FBQztRQUV6QixDQUFDLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsVUFBVSxFQUFFLENBQUMsSUFBUyxFQUFFLEVBQUU7WUFDM0MsSUFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7WUFDekIsSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUNsQixDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyxLQUFLLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQztRQUN6QixJQUFJLENBQUMsWUFBWSxFQUFFLENBQUM7UUFFcEIsSUFBSSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLFdBQVcsRUFB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