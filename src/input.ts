import _ from "underscore";

import * as chip from "./chip";

export class Keyboard extends chip.ChipBase {
  public keysDown: { [key: string]: number } = {};
  public keysJustDown: { [key: string]: boolean } = {};
  public keysJustUp: { [key: string]: boolean } = {};

  private _lastKeysDown: { [key: string]: number } = {};
  // private _onKeyDownWrapper = this._onKeyDown.bind(this);
  // private _onKeyUpWrapper = this._onKeyUp.bind(this);
  // private _onFocusOutWrapper = this._onFocusOut.bind(this);

  private _elapsedTime: number;

  constructor(public readonly emitter: EventTarget) {
    super();
  }

  _onActivate() {
    this._elapsedTime = 0;

    this._subscribe(this.emitter, "keydown", this._onKeyDown);
    this._subscribe(this.emitter, "keyup", this._onKeyUp);
    this._subscribe(this.emitter, "focusout", this._onFocusOut);
  }

  _onTick() {
    this._elapsedTime += this._lastTickInfo.timeSinceLastTick;

    const keyDownSet = _.keys(this.keysDown);
    const lastKeyDownSet = _.keys(this._lastKeysDown);

    this.keysJustDown = {};
    for (const key of _.difference(keyDownSet, lastKeyDownSet))
      this.keysJustDown[key] = true;

    this.keysJustUp = {};
    for (const key of _.difference(lastKeyDownSet, keyDownSet))
      this.keysJustUp[key] = true;

    this._lastKeysDown = _.clone(this.keysDown);
  }

  _onKeyDown(event: KeyboardEvent) {
    event.preventDefault();

    // console.log("key down", event.code);
    this.keysDown[event.code] = this._elapsedTime;
  }

  _onKeyUp(event: KeyboardEvent) {
    event.preventDefault();

    // console.log("key up", event.code);
    delete this.keysDown[event.code];
  }

  _onFocusOut() {
    this.keysDown = {};
  }
}

export const GAMEPAD_DEAD_ZONE = 0.15;

export function countGamepads(): number {
  //@ts-ignore
  return _.filter(navigator.getGamepads(), _.idchip).length;
}

export class Gamepad extends chip.ChipBase {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public lastData: any;
  public buttonsDown: { [key: string]: number };
  public buttonsJustDown: { [key: string]: boolean };
  public buttonsJustUp: { [key: string]: boolean };

  private _lastButtonsDown: { [key: string]: number };

  public axes: number[];

  private _elapsedTime: number;

  constructor(public gamepadIndex: number) {
    super();
  }

  _onActivate() {
    this._elapsedTime = 0;

    this.axes = [];

    this.buttonsDown = {};
    this.buttonsJustDown = {};
    this.buttonsJustUp = {};

    this._lastButtonsDown = {};

    this._updateState();
    // TODO: track events of disconnecting gamepads
  }

  _onTick() {
    this._elapsedTime += this._lastTickInfo.timeSinceLastTick;

    this._updateState();
  }

  _updateState() {
    //@ts-ignore
    this.lastData = _.filter(navigator.getGamepads(), _.idchip)[
      this.gamepadIndex
    ];
    if (!this.lastData) return; // Gamepad must have been disconnected

    this.axes = [];
    for (let i = 0; i < this.lastData.axes.length; i++) {
      this.axes.push(
        Math.abs(this.lastData.axes[i]) >= GAMEPAD_DEAD_ZONE
          ? this.lastData.axes[i]
          : 0
      );
    }

    this.buttonsDown = {};
    for (let i = 0; i < this.lastData.buttons.length; i++) {
      if (this.lastData.buttons[i].pressed) {
        if (!this.buttonsDown[i]) this.buttonsDown[i] = this._elapsedTime;
      } else {
        delete this.buttonsDown[i];
      }
    }

    const buttonDownSet = _.keys(this.buttonsDown);
    const lastButtonDownSet = _.keys(this._lastButtonsDown);

    this.buttonsJustDown = {};
    for (const button of _.difference(buttonDownSet, lastButtonDownSet))
      this.buttonsJustDown[button] = true;

    this.buttonsJustUp = {};
    for (const button of _.difference(lastButtonDownSet, buttonDownSet))
      this.buttonsJustUp[button] = true;

    this._lastButtonsDown = _.clone(this.buttonsDown);
  }
}
