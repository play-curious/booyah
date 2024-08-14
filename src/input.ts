import _ from "underscore";

import * as chip from "./chip";

export class KeyboardOptions {
  emitter: EventTarget = window;

  /** Should `event.preventDefault()` to be called on `keydown` and `keyup` events */
  preventDefault = true;

  /** The property of the KeyboardEvent that is stored in `keysDown`, `keysUp`, etc.
   * [`code`, the default, is based on the physical position on keyboard, independant of the layout](https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/code)
   * [`key` depends on the player's keyboard](https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/key).
   */
  eventAttribute: "code" | "key" = "code";

  /** If true, will console log `eventAttribute` on each key down or up  */
  logEvent = false;
}

export type KeyToNumber = { [key: string]: number };
export type KeyToBoolean = { [key: string]: boolean };

export class Keyboard extends chip.ChipBase {
  private readonly _options: KeyboardOptions;

  private _keysDown: KeyToNumber;
  private _keysJustDown: KeyToBoolean;
  private _keysJustUp: KeyToBoolean;
  private _lastKeysDown: KeyToNumber;
  private _elapsedTime: number;
  private _focusJustLost: boolean;

  constructor(options?: Partial<KeyboardOptions>) {
    super();

    this._options = chip.fillInOptions(options, new KeyboardOptions());
  }

  _onActivate() {
    this._elapsedTime = 0;
    this._focusJustLost = false;
    this._clearKeyTables();

    this._subscribe(this._options.emitter, "keydown", this._onKeyDown);
    this._subscribe(this._options.emitter, "keyup", this._onKeyUp);
    this._subscribe(this._options.emitter, "focusout", this._onFocusOut);
  }

  _onTick() {
    this._elapsedTime += this._lastTickInfo.timeSinceLastTick;

    // If focus was lost on previous tick, assume all keys were released
    if (this._focusJustLost) {
      this._focusJustLost = false;
      this._keysDown = {};
    }

    this._calculateKeyTables();
  }

  private _onKeyDown(event: KeyboardEvent) {
    if (this._options.preventDefault) event.preventDefault();

    const keyValue = event[this._options.eventAttribute];
    this._keysDown[keyValue] = this._elapsedTime;

    if (this._options.logEvent) console.log("key down", keyValue);
  }

  private _onKeyUp(event: KeyboardEvent) {
    if (this._options.preventDefault) event.preventDefault();

    const keyValue = event[this._options.eventAttribute];
    delete this._keysDown[keyValue];

    if (this._options.logEvent) console.log("key up", keyValue);
  }

  private _onFocusOut() {
    this._focusJustLost = true;
  }

  private _clearKeyTables() {
    this._keysDown = {};
    this._keysJustDown = {};
    this._keysJustUp = {};
    this._lastKeysDown = {};
  }

  private _calculateKeyTables() {
    const keyDownSet = _.keys(this._keysDown);
    const lastKeyDownSet = _.keys(this._lastKeysDown);

    this._keysJustDown = {};
    for (const key of _.difference(keyDownSet, lastKeyDownSet))
      this._keysJustDown[key] = true;

    this._keysJustUp = {};
    for (const key of _.difference(lastKeyDownSet, keyDownSet))
      this._keysJustUp[key] = true;

    this._lastKeysDown = _.clone(this._keysDown);
  }

  get keysDown(): Readonly<KeyToNumber> {
    return this._keysDown;
  }

  get keysJustDown(): Readonly<KeyToBoolean> {
    return this._keysJustDown;
  }

  get keysJustUp(): Readonly<KeyToBoolean> {
    return this._keysJustUp;
  }

  isKeyDown(key: string): boolean {
    return key in this._keysDown;
  }

  getKeyDownTime(key: string): number | undefined {
    return this._keysDown[key];
  }

  isKeyJustDown(key: string) {
    return key in this._keysJustDown;
  }

  isKeyJustUp(key: string) {
    return key in this._keysJustUp;
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
          : 0,
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
