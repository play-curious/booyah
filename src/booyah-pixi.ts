import * as PIXI from "pixi.js";

import * as chip from "./chip";

export class DisplayObjectChip<
  DisplayObjectType extends PIXI.DisplayObject
> extends chip.ChipBase {
  constructor(public readonly displayObject: DisplayObjectType) {
    super();
  }

  _onActivate() {
    this._chipContext.container.addChild(this.displayObject);
  }

  _onTerminate() {
    this._chipContext.container.removeChild(this.displayObject);
  }
}

/** 
  Manages an animated sprite in PIXI, pausing the sprite during pauses.

  When the animation completes (if the animation is not set to loop, then this will request a signal)

 Emits:
 - beforeTearDown
*/
export class AnimatedSpriteChipOptions {
  loop = false;

  animationSpeed?: number;
  position?: PIXI.IPoint;
  anchor?: PIXI.IPoint;
  rotation?: number;
  startingFrame?: number;
}

export class AnimatedSpriteChip extends chip.ChipBase {
  private _spritesheetName: string;
  private _options: AnimatedSpriteChipOptions;

  private _sprite: PIXI.AnimatedSprite;

  constructor(
    spritesheetName: string,
    options?: Partial<AnimatedSpriteChipOptions>
  ) {
    super();

    this._spritesheetName = spritesheetName;
    this._options = chip.fillInOptions(
      options,
      new AnimatedSpriteChipOptions()
    );
  }

  _onActivate() {
    const resource =
      this._chipContext.app.loader.resources[this._spritesheetName];
    if (!resource)
      throw new Error(
        `Cannot find resource for spritesheet: ${this._spritesheetName}`
      );

    this._sprite = new PIXI.AnimatedSprite(
      Object.values(resource.textures) as PIXI.Texture[],
      false
    );
    this._chipContext.container.addChild(this._sprite);

    if (!this._options.loop) {
      // PIXI.AnimatedSprite loops by default
      this._sprite.loop = false;
      this._sprite.onComplete = this._onAnimationComplete.bind(this);
    }

    for (const prop of ["animationSpeed", "position", "anchor", "rotation"]) {
      // @ts-ignore
      if (_.has(this._options, prop)) this._sprite[prop] = this._options[prop];
    }

    if (typeof this._options.startingFrame !== "undefined") {
      this._sprite.gotoAndPlay(this._options.startingFrame);
    } else {
      this._sprite.play();
    }
  }

  _onTick(tickInfo: chip.TickInfo) {
    this._sprite.tick(tickInfo.timeSinceLastTick);
  }

  onSignal(tickInfo: chip.TickInfo, signal: string) {
    switch (signal) {
      case "pause":
        this._sprite.stop();
        break;
      case "play":
        this._sprite.play();
        break;
    }
  }

  _onTerminate() {
    this._chipContext.container.removeChild(this._sprite);
    delete this._sprite;
  }

  private _onAnimationComplete() {
    this._outputSignal = chip.makeSignal();
  }
}
