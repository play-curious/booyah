import * as util from "./util";
import * as entity from "./entity";
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
            volume: 0.25,
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
            volume: 1,
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
                src: _.map(AUDIO_FILE_FORMATS, (audioFormat) => `audio/${directory}/${assetDescription}.${audioFormat}`),
            });
        }
        else {
            const url = assetDescription.url;
            assets[assetDescription.key] = new Howl({
                src: _.map(AUDIO_FILE_FORMATS, (audioFormat) => `audio/${directory}/${url}.${audioFormat}`),
            });
        }
    }
    return assets;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXVkaW8uanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi90eXBlc2NyaXB0L2F1ZGlvLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLE9BQU8sS0FBSyxJQUFJLE1BQU0sUUFBUSxDQUFDO0FBQy9CLE9BQU8sS0FBSyxNQUFNLE1BQU0sVUFBVSxDQUFDO0FBQ25DLE9BQU8sQ0FBQyxNQUFNLFlBQVksQ0FBQztBQUUzQixNQUFNLENBQUMsTUFBTSxrQkFBa0IsR0FBRyxDQUFDLEtBQUssQ0FBQyxDQUFDO0FBTTFDOzs7RUFHRTtBQUNGLE1BQU0sT0FBTyxPQUFRLFNBQVEsTUFBTSxDQUFDLE1BQU07SUFNeEMsWUFBWSxVQUEwQixFQUFFO1FBQ3RDLEtBQUssRUFBRSxDQUFDO1FBRVIsSUFBSSxDQUFDLFlBQVksQ0FBQyxJQUFJLEVBQUUsT0FBTyxFQUFFO1lBQy9CLE1BQU0sRUFBRSxJQUFJO1NBQ2IsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztJQUVELE1BQU0sQ0FBQyxNQUEyQjtRQUNoQyxJQUFJLENBQUMsU0FBUyxHQUFHLElBQUksQ0FBQztRQUN0QixJQUFJLENBQUMsWUFBWSxHQUFHLElBQUksQ0FBQztRQUV6QixDQUFDLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsVUFBVSxFQUFFLENBQUMsSUFBVSxFQUFFLEVBQUU7WUFDNUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7WUFDekIsSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUNsQixDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyxLQUFLLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUM7UUFDL0IsSUFBSSxDQUFDLFlBQVksRUFBRSxDQUFDO1FBRXBCLElBQUksQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxXQUFXLEVBQUUsU0FBUyxFQUFFLElBQUksQ0FBQyxZQUFZLENB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