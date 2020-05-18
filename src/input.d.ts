import * as entity from "./entity";
export declare class Keyboard extends entity.Entity {
    keysDown: {
        [key: string]: number;
    };
    keysJustDown: {
        [key: string]: boolean;
    };
    keysJustUp: {
        [key: string]: boolean;
    };
    timeSinceStart: number;
    private _lastKeysDown;
    private _onKeyDownWrapper;
    private _onKeyUpWrapper;
    private _onFocusOutWrapper;
    setup(config: entity.Config): void;
    update(options: entity.Options): void;
    teardown(): void;
    _onKeyDown(event: KeyboardEvent): void;
    _onKeyUp(event: KeyboardEvent): void;
    _onFocusOut(): void;
}
export declare const GAMEPAD_DEAD_ZONE = 0.15;
export declare function countGamepads(): number;
export declare class Gamepad extends entity.Entity {
    gamepadIndex: number;
    state: any;
    buttonsDown: {
        [key: string]: number;
    };
    buttonsJustDown: {
        [key: string]: boolean;
    };
    buttonsJustUp: {
        [key: string]: boolean;
    };
    timeSinceStart: number;
    private _lastButtonsDown;
    axes: number[];
    constructor(gamepadIndex: number);
    setup(config: entity.Config): void;
    update(options: entity.Options): void;
    _updateState(): void;
}
