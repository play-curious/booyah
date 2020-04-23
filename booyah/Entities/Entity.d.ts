import * as PIXI from 'pixi.js-legacy';
export interface EventListener {
    emitter?: PIXI.utils.EventEmitter;
    event?: string;
    cb?: () => void;
}
export interface EntityConfig {
}
export interface UpdateOptions {
    playTime: number;
    timeSinceStart: number;
    timeScale: number;
    gameState: 'playing' | 'paused';
}
export interface TearDownOptions {
}
export default abstract class Entity extends PIXI.utils.EventEmitter {
    isSetup: boolean;
    eventListeners: EventListener[];
    requestedTransition: any;
    config: EntityConfig;
    abstract _setup?(config: EntityConfig): void;
    abstract _update?(options: UpdateOptions): void;
    abstract _teardown?(options: TearDownOptions): void;
    abstract _onSignal?(signal: string, data?: any): void;
    setup(config: EntityConfig): void;
    update(options: UpdateOptions): void;
    teardown(options: TearDownOptions): void;
    onSignal(signal: string, data?: any): void;
    protected _on(emitter: PIXI.utils.EventEmitter, event: string, cb: () => void): void;
    protected _off(emitter?: PIXI.utils.EventEmitter, event?: string, cb?: () => void): void;
}
