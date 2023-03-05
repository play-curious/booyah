import * as PIXI from "pixi.js";

import * as entity from "./entity";

export class DisplayObjectEntity<
  DisplayObjectType extends PIXI.DisplayObject
> extends entity.EntityBase {
  constructor(public readonly displayObject: DisplayObjectType) {
    super();
  }

  _onActivate() {
    this._entityConfig.container.addChild(this.displayObject);
  }

  _onDeactivate() {
    this._entityConfig.container.removeChild(this.displayObject);
  }
}

/** 
  Manages an animated sprite in PIXI, pausing the sprite during pauses.

  When the animation completes (if the animation is not set to loop, then this will request a transition)

 Emits:
 - beforeTearDown
*/
export class AnimatedSpriteEntityOptions {
  loop = false;

  animationSpeed?: number;
  position?: PIXI.IPoint;
  anchor?: PIXI.IPoint;
  rotation?: number;
  startingFrame?: number;
}

export class AnimatedSpriteEntity extends entity.EntityBase {
  private _spritesheetName: string;
  private _options: AnimatedSpriteEntityOptions;

  private _sprite: PIXI.AnimatedSprite;

  constructor(
    spritesheetName: string,
    options?: Partial<AnimatedSpriteEntityOptions>
  ) {
    super();

    this._spritesheetName = spritesheetName;
    this._options = entity.fillInOptions(
      options,
      new AnimatedSpriteEntityOptions()
    );
  }

  _onActivate() {
    const resource =
      this._entityConfig.app.loader.resources[this._spritesheetName];
    if (!resource)
      throw new Error(
        `Cannot find resource for spritesheet: ${this._spritesheetName}`
      );

    this._sprite = new PIXI.AnimatedSprite(
      Object.values(resource.textures) as PIXI.Texture[],
      false
    );
    this._entityConfig.container.addChild(this._sprite);

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

  _onUpdate(frameInfo: entity.FrameInfo) {
    this._sprite.update(frameInfo.timeSinceLastFrame);
  }

  onSignal(frameInfo: entity.FrameInfo, signal: string) {
    switch (signal) {
      case "pause":
        this._sprite.stop();
        break;
      case "play":
        this._sprite.play();
        break;
    }
  }

  _onDeactivate() {
    this._entityConfig.container.removeChild(this._sprite);
    delete this._sprite;
  }

  private _onAnimationComplete() {
    this._transition = entity.makeTransition();
  }
}
