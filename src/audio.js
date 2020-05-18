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
        this.muted = this.config.muted;
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
export function makeInstallJukebox(options) {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXVkaW8uanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi90eXBlc2NyaXB0L2F1ZGlvLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLE9BQU8sS0FBSyxJQUFJLE1BQU0sUUFBUSxDQUFDO0FBQy9CLE9BQU8sS0FBSyxNQUFNLE1BQU0sVUFBVSxDQUFDO0FBQ25DLE9BQU8sRUFBQyxJQUFJLEVBQUMsTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxDQUFDLE1BQU0sWUFBWSxDQUFDO0FBRTNCLE1BQU0sQ0FBQyxNQUFNLGtCQUFrQixHQUFHLENBQUMsS0FBSyxDQUFDLENBQUE7QUFNekM7OztFQUdFO0FBQ0YsTUFBTSxPQUFPLE9BQVEsU0FBUSxNQUFNLENBQUMsTUFBTTtJQU94QyxZQUFZLFVBQXlCLEVBQUU7UUFDckMsS0FBSyxFQUFFLENBQUM7UUFFUixJQUFJLENBQUMsWUFBWSxDQUFDLElBQUksRUFBRSxPQUFPLEVBQUU7WUFDL0IsTUFBTSxFQUFFLElBQUk7U0FDYixDQUFDLENBQUM7SUFDTCxDQUFDO0lBRUQsTUFBTSxDQUFDLE1BQXFCO1FBQzFCLElBQUksQ0FBQyxTQUFTLEdBQUcsSUFBSSxDQUFDO1FBQ3RCLElBQUksQ0FBQyxZQUFZLEdBQUcsSUFBSSxDQUFDO1FBRXpCLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxVQUFVLEVBQUUsQ0FBQyxJQUFTLEVBQUUsRUFBRTtZQUMzQyxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUN6QixJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ2xCLENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLEtBQUssR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQztRQUMvQixJQUFJLENBQUMsWUFBWSxFQUFFLENBQUM7UUFFcEIsSUFBSSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsTUFBTSxD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