import * as sound from "@pixi/sound";
import * as PIXI from "pixi.js";

import * as chip from "booyah/src/chip";

export class DJOptions {
  musicChannelVolume = 0.25;
  fxChannelVolume = 1;
}

export class PlayingMusicOptions {
  volumeScale = 1;
  loop = true;
}

export class PlayingFxOptions {
  volumeScale = 1;
  loop = false;
  duckMusic = false;
}

class PlayingMusic extends PlayingMusicOptions {
  name: string;
}

/** 
  A music player, that only plays one track at a time.
  By default the volume is lowered to not interfere with sound effects.
*/
export class Dj extends chip.ChipBase {
  private _options: DJOptions;
  private _musicChannelVolume: number;
  private _fxChannelVolume: number;

  private _playingMusic?: PlayingMusic;
  private _playingFx: Record<string, PlayingFxOptions>;
  private _lastRequestedMusicName?: string;

  constructor(options?: Partial<DJOptions>) {
    super();

    this._options = chip.fillInOptions(options, new DJOptions());
  }

  protected _onActivate(): void {
    this._musicChannelVolume = this._options.musicChannelVolume;
    this._fxChannelVolume = this._options.fxChannelVolume;

    this._playingFx = {};
  }

  _onTerminate() {
    this.stopMusic();
    this.stopAllFx();
  }

  protected _onPause(): void {
    this.pauseMusic();
    this.pauseAllFx();
  }

  protected _onResume(): void {
    this.resumeMusic();
    this.resumeAllFx();
  }

  pauseMusic(): void {
    if (!this._playingMusic) return;

    this._getSoundResource(this._playingMusic.name).pause();
  }

  resumeMusic(): void {
    if (!this._playingMusic) return;

    this._getSoundResource(this._playingMusic.name).resume();
  }

  get musicChannelVolume(): number {
    return this._musicChannelVolume;
  }

  set musicChannelVolume(value: number) {
    this._musicChannelVolume = value;
    if (!this._playingMusic) return;

    this._getSoundResource(this._playingMusic.name).volume =
      this._playingMusic.volumeScale * this._musicChannelVolume;
  }

  async playMusic(name: string, options?: Partial<PlayingMusicOptions>) {
    console.log("playMusic() called", name, options, this._playingMusic);

    this._lastRequestedMusicName = name;

    // Wait for the music to load, if not already loaded
    const resource = await PIXI.Assets.load(name);

    // Some other music must have been requested in the meantime
    if (this._lastRequestedMusicName !== name) return;

    // Don't play the same thing twice
    if (this._playingMusic && this._playingMusic.name === name) return;

    this.stopMusic();

    const completeOptions = chip.fillInOptions(
      options,
      new PlayingMusicOptions()
    );

    resource.play({
      loop: completeOptions.loop,
      singleInstance: true,
    });
    // For some reason the volume in play() seems to be ignored, so set it  here...
    resource.volume = this._musicChannelVolume * completeOptions.volumeScale;

    this._playingMusic = Object.assign({}, completeOptions, { name });
    console.log("playMusic() end", name, options, this._playingMusic);
  }

  stopMusic() {
    if (!this._playingMusic) return;

    console.log("stopMusic() called", this._playingMusic);

    this._getSoundResource(this._playingMusic.name).stop();
    delete this._playingMusic;
  }

  /** Returns sound duration in ms */
  getDuration(name: string): number {
    return this._getSoundResource(name).duration * 1000;
  }

  async playFx(name: string, options?: Partial<PlayingFxOptions>) {
    const resource = this._getSoundResource(name);

    const completeOptions = chip.fillInOptions(options, new PlayingFxOptions());

    if (completeOptions.duckMusic) {
      this.pauseMusic();
    }

    resource.play({
      loop: completeOptions.loop,
      complete: () => {
        delete this._playingFx[name];

        if (completeOptions.duckMusic) {
          this.resumeMusic();
        }

        this.emit("complete", name);
      },
    });

    // For some reason the volume given to play() seems to be ignored, so let's set it here
    resource.volume = this._fxChannelVolume * completeOptions.volumeScale;

    this._playingFx[name] = completeOptions;
  }

  stopFx(name: string): void {
    this._getSoundResource(name).stop();
    delete this._playingFx[name];
  }

  stopAllFx(): void {
    for (const name in this._playingFx) {
      this.stopFx(name);
    }
  }

  pauseFx(name: string): void {
    this._getSoundResource(name).pause();
  }

  pauseAllFx(): void {
    for (const name in this._playingFx) {
      this.pauseFx(name);
    }
  }

  resumeFx(name: string): void {
    this._getSoundResource(name).resume();
  }

  resumeAllFx(): void {
    for (const name in this._playingFx) {
      this.resumeFx(name);
    }
  }

  get fxChannelVolume(): number {
    return this._fxChannelVolume;
  }

  set fxChannelVolume(value: number) {
    this._fxChannelVolume = value;

    for (const name in this._playingFx) {
      this._getSoundResource(name).volume =
        this._fxChannelVolume * this._playingFx[name].volumeScale;
    }
  }

  private _getSoundResource(name: string): sound.Sound {
    const resource = PIXI.Assets.get<sound.Sound>(name);
    if (!resource) throw new Error(`Sound fx ${name} is not loaded`);

    return resource;
  }
}

/**
  A chip that requests the music be changed
*/
export class PlayMusic extends chip.ChipBase {
  private _options: PlayingMusicOptions;

  constructor(
    private readonly _trackName: string,
    options?: Partial<PlayingMusicOptions>
  ) {
    super();

    this._options = chip.fillInOptions(options, new PlayingMusicOptions());
  }

  _onActivate() {
    this._chipContext.dj.playMusic(this._trackName, this._options);
    this.terminate();
  }
}

/**
  A chip that plays a sounds efect
*/
export class PlayFx extends chip.ChipBase {
  private _options: PlayingFxOptions;

  constructor(
    private readonly _trackName: string,
    options?: Partial<PlayingFxOptions>
  ) {
    super();

    this._options = chip.fillInOptions(options, new PlayingFxOptions());
  }

  _onActivate() {
    this._chipContext.dj.playFx(this._trackName, this._options);
    this.terminate();
  }
}
