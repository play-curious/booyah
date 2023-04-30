import { sound } from "@pixi/sound";
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
    if (this._playingMusic) sound.pause(this._playingMusic.name);
  }

  resumeMusic(): void {
    if (this._playingMusic) sound.resume(this._playingMusic.name);
  }

  get musicChannelVolume(): number {
    return this._musicChannelVolume;
  }

  set musicChannelVolume(value: number) {
    this._musicChannelVolume = value;
    if (this._playingMusic)
      sound.volume(
        this._playingMusic.name,
        this._playingMusic.volumeScale * this._musicChannelVolume
      );
  }

  async playMusic(name: string, options?: Partial<PlayingMusicOptions>) {
    console.log("playMusic() called", name, options, this._playingMusic);

    this._lastRequestedMusicName = name;

    // Wait for the music to load, if not already loaded
    await PIXI.Assets.load(name);

    // Some other music must have been requested in the meantime
    if (this._lastRequestedMusicName !== name) return;

    // Don't play the same thing twice
    if (this._playingMusic && this._playingMusic.name === name) return;

    this.stopMusic();

    const completeOptions = chip.fillInOptions(
      options,
      new PlayingMusicOptions()
    );

    sound.play(name, {
      volume: this._musicChannelVolume * completeOptions.volumeScale,
      loop: completeOptions.loop,
    });

    this._playingMusic = Object.assign({}, completeOptions, { name });
    console.log("playMusic() end", name, options, this._playingMusic);
  }

  stopMusic() {
    if (!this._playingMusic) return;

    console.log("stopMusic() called", this._playingMusic);

    sound.stop(this._playingMusic.name);
    delete this._playingMusic;
  }

  /** Returns sound duration in ms */
  getDuration(name: string): number {
    return sound.duration(name) * 1000;
  }

  async playFx(name: string, options?: Partial<PlayingFxOptions>) {
    await PIXI.Assets.load(name);

    const completeOptions = chip.fillInOptions(options, new PlayingFxOptions());

    if (completeOptions.duckMusic) {
      this.pauseMusic();
    }

    sound.play(name, {
      volume: this._fxChannelVolume * completeOptions.volumeScale,
      loop: completeOptions.loop,
      complete: () => {
        delete this._playingFx[name];

        if (completeOptions.duckMusic) {
          this.resumeMusic();
        }

        this.emit("complete", name);
      },
    });

    this._playingFx[name] = completeOptions;
  }

  stopFx(name: string): void {
    sound.stop(name);
    delete this._playingFx[name];
  }

  stopAllFx(): void {
    for (const name in this._playingFx) {
      this.stopFx(name);
    }
  }

  pauseFx(name: string): void {
    sound.pause(name);
  }

  pauseAllFx(): void {
    for (const name in this._playingFx) {
      this.pauseFx(name);
    }
  }

  resumeFx(name: string): void {
    sound.resume(name);
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
      sound.volume(
        name,
        this._fxChannelVolume * this._playingFx[name].volumeScale
      );
    }
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
