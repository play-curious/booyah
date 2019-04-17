import * as util from "./util.js";
import * as entity from "./entity.js";


export class Keyboard extends entity.Entity {
  setup(config) {
    super.setup(config);

    this.keysDown = {};
    this.keysJustDown = {};
    this.keysJustUp = {};

    this._lastKeysDown = {};

    this._onKeyDownWrapper = this._onKeyDown.bind(this);
    this._onKeyUpWrapper = this._onKeyUp.bind(this);
    this._onFocusOutWrapper = this._onFocusOut.bind(this);

    this.config.app.view.addEventListener("keydown", this._onKeyDownWrapper);
    this.config.app.view.addEventListener("keyup", this._onKeyUpWrapper);
    this.config.app.view.addEventListener("focusout", this._onFocusOutWrapper);
  }

  update(options) {
    this.timeSinceStart = options.timeSinceStart;

    const keyDownSet = _.keys(this.keysDown);
    const lastKeyDownSet = _.keys(this._lastKeysDown);

    this.keysJustDown = {};
    for(const key of _.difference(keyDownSet, lastKeyDownSet)) this.keysJustDown[key] = true;

    this.keysJustUp = {};
    for(const key of _.difference(lastKeyDownSet, keyDownSet)) this.keysJustUp[key] = true;

    this._lastKeysDown = _.clone(this.keysDown);
  }

  teardown() {
    this.config.app.view.removeEventListener("keydown", this._onKeyDownWrapper);
    this.config.app.view.removeEventListener("keyup", this._onKeyUpWrapper);
    this.config.app.view.removeEventListener("focusout", this._onFocusOutWrapper);
  }

  _onKeyDown(event) {
    event.preventDefault();

    // console.log("key down", event.code);
    this.keysDown[event.code] = this.timeSinceStart;
  }

  _onKeyUp(event) {
    event.preventDefault();

    // console.log("key up", event.code);
    delete this.keysDown[event.code];
  }

  _onFocusOut() {
    this.keysDown = {}; 
  }
}


export const GAMEPAD_DEAD_ZONE = 0.15;

export function countGamepads() {
  return _.filter(navigator.getGamepads(), _.identity).length;
} 

export class Gamepad extends entity.Entity {
  constructor(gamepadIndex) {
    super();

    this.gamepadIndex = gamepadIndex;
  }

  setup(config) {
    super.setup(config);

    this.axes = [];

    this.buttonsDown = {};
    this.buttonsJustDown = {};
    this.buttonsJustUp = {};

    this._lastButtonsDown = {};

    this.timeSinceStart = 1;
    this._updateState();
    // TODO: track events of disconnecting gamepads
  }

  update(options) {
    super.update(options);

    this.timeSinceStart = options.timeSinceStart;
    this._updateState(options);
  }

  _updateState() {
    this.state = _.filter(navigator.getGamepads(), _.identity)[this.gamepadIndex];
    if(!this.state) return; // Gamepad must have been disconnected

    this.axes = [];
    for(let i = 0; i < this.state.axes.length; i++) {
      this.axes.push(Math.abs(this.state.axes[i]) >= GAMEPAD_DEAD_ZONE ? this.state.axes[i] : 0);
    }

    this.buttonsDown = {};
    for(let i = 0; i < this.state.buttons.length; i++) {
      if(this.state.buttons[i].pressed) {
        if(!this.buttonsDown[i]) this.buttonsDown[i] = this.timeSinceStart;
      } else {
        delete this.buttonsDown[i];
      }
    }

    const buttonDownSet = _.keys(this.buttonsDown);
    const lastButtonDownSet = _.keys(this._lastButtonsDown);

    this.buttonsJustDown = {};
    for(const button of _.difference(buttonDownSet, lastButtonDownSet)) this.buttonsJustDown[button] = true;

    this.buttonsJustUp = {};
    for(const button of _.difference(lastButtonDownSet, buttonDownSet)) this.buttonsJustUp[button] = true;

    this._lastButtonsDown = _.clone(this.buttonsDown);
  }
}
