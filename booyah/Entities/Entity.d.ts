import * as PIXI from 'pixi.js-legacy';
export declare type EntityResolvable = Entity | {
    entity: Entity;
    config: EntityConfig;
};
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
/**
 In Booyah, the game is structured as a tree of entities. This is the base class for all entities.

 An entity has the following lifecycle:
     1. It is instantiated using the contructor.
         Only parameters specific to the entity should be passed here.
         The entity should not make any changes to the environment here, it should wait for setup().
     2. setup() is called just once, with a configuration.
         This is when the entity should add dispaly objects  to the scene, or subscribe to events.
         The typical config contains { app, preloader, narrator, jukebox, container }
     3. update() is called one or more times, with options.
         It could also never be called, in case the entity is torn down directly.
         If the entity wishes to be terminated, it should set this.requestedTransition to a truthy value.
         Typical options include { playTime, timeSinceStart, timeSinceLastFrame, timeScale, gameState }
         For more complicated transitions, it can return an object like { name: "", params: {} }
     4. teardown() is called just once.
        The entity should remove any changes it made, such as adding display objects to the scene, or subscribing to events.

 The base class will check that this lifecyle is respected, and will log errors to signal any problems.

 In the case that, subclasses do not need to override these methods, but override the underscore versions of them: _setup(), _update(), etc.
 This ensures that the base class behavior of will be called automatically.
*/
export default abstract class Entity extends PIXI.utils.EventEmitter {
    isSetup: boolean;
    eventListeners: EventListener[];
    requestedTransition: boolean;
    config: EntityConfig;
    setup(config: EntityConfig): void;
    update(options: UpdateOptions): void;
    teardown(options?: TearDownOptions): void;
    onSignal(signal: string, data?: any): void;
    protected _on(emitter: PIXI.utils.EventEmitter, event: string, cb: () => void): void;
    protected _off(emitter?: PIXI.utils.EventEmitter, event?: string, cb?: () => void): void;
    _setup(config: EntityConfig): void;
    _update(options: UpdateOptions): void;
    _teardown(options?: TearDownOptions): void;
    _onSignal(signal: string, data?: any): void;
    static processEntityConfig(config: EntityConfig, alteredConfig: EntityConfig | ((config: EntityConfig) => EntityConfig)): EntityConfig;
    static extendConfig(values: any[]): (config: EntityConfig) => {};
}
