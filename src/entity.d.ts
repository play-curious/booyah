import { GameState } from "./booyah";
export interface IEventListener {
    emitter: PIXI.utils.EventEmitter;
    event: string;
    cb: () => any;
}
export interface TransitionResolvable {
    name: string;
    params: any;
}
export declare type EntityConfig = {
    [k: string]: any;
};
export interface FrameInfo {
    playTime: number;
    timeSinceStart: number;
    timeSinceLastFrame: number;
    timeScale: number;
    gameState: GameState;
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
export declare abstract class Entity extends PIXI.utils.EventEmitter {
    isSetup: boolean;
    eventListeners: IEventListener[];
    requestedTransition: any;
    config: EntityConfig;
    setup(config: EntityConfig): void;
    update(options: FrameInfo): void;
    teardown(options?: any): void;
    onSignal(signal: string, data?: any): void;
    protected _on(emitter: PIXI.utils.EventEmitter, event: string, cb: () => void): void;
    protected _off(emitter?: PIXI.utils.EventEmitter, event?: string, cb?: () => void): void;
    _setup(config: any): void;
    _update(options: any): void;
    _teardown(options?: any): void;
    _onSignal(signal: string, data?: any): void;
    static processEntityConfig(config: any, alteredConfig: any): any;
    static extendConfig(values: any[]): (config: any) => {};
}
/** Empty class just to indicate an entity that does nothing and never requests a transition  */
export declare class NullEntity extends Entity {
}
/** An entity that returns the requested transition immediately  */
export declare class TransitoryEntity extends Entity {
    transition: boolean;
    constructor(transition?: boolean);
    _setup(): void;
}
export interface ParallelEntityOptions {
    autoTransition?: boolean;
}
/**
 Allows a bunch of entities to execute in parallel.
 Updates child entities until they ask for a transition, at which point they are torn down.
 If autoTransition=true, requests a transition when all child entities have completed.
 */
export declare class ParallelEntity extends Entity {
    entities: Entity[];
    entityConfigs: EntityConfig[];
    entityIsActive: boolean[];
    autoTransition: boolean;
    /**
     @entities can be subclasses of entity.Entity or an object like { entity:, config: }
     @options:
     * autoTransition: Should the entity request a transition when all the child entities are done?  (defaults to false)
     */
    constructor(entities?: any[], options?: ParallelEntityOptions);
    setup(config: any): void;
    update(options: any): void;
    teardown(): void;
    onSignal(signal: string, data?: any): void;
    addEntity(entity: Entity, config?: any): void;
    removeEntity(entity: Entity): void;
    removeAllEntities(): void;
}
export interface EntitySequenceOptions {
    loop?: boolean;
}
/**
  Runs one child entity after another.
  When done, requestes the last transition demanded.
  Optionally can loop back to the first entity.
*/
export declare class EntitySequence extends Entity implements EntitySequenceOptions {
    entities: Entity[];
    loop: boolean;
    currentEntityIndex: number;
    currentEntity: Entity;
    lastUpdateOptions: any;
    lastRequestedTransition: any;
    childStartedAt: number;
    constructor(entities: Entity[], options?: EntitySequenceOptions);
    addEntity(entity: Entity): void;
    skip(): void;
    setup(config: any): void;
    update(options: any): void;
    teardown(): void;
    onSignal(signal: string, data?: any): void;
    restart(): void;
    _activateEntity(time: number): void;
    _deactivateEntity(): void;
    _advance(transition: any): void;
}
/**
  Represents a state machine, where each state has a name, and is represented by an entity.
  Only one state is active at a time.
  The state machine has one starting state, but can have multiple ending states.
  When the machine reaches an ending state, it requests a transition with a name equal to the name of the ending state.
  By default, the state machine begins at the state called "start", and stops at "end".

  The transitions are not provided directly by the states (entities) by rather by a transition table provided in the constructor.
  A transition is defined as either a name (string) or { name, params }.
  To use have a transition table within a transition table, use the function makeTransitionTable()
*/
export declare class StateMachine extends Entity {
    states: {
        [n: string]: Entity;
    };
    transitions: {
        [k: string]: TransitionResolvable;
    };
    startingStateParams: any;
    startingState: any;
    startingProgress: any;
    visitedStates: any;
    progress: any;
    state: Entity;
    stateName: string;
    sceneStartedAt: number;
    endingStates: any;
    stateParams: {};
    constructor(states: {
        [n: string]: Entity;
    }, transitions: {
        [k: string]: TransitionResolvable;
    }, options?: any);
    setup(config: EntityConfig): void;
    update(options: FrameInfo): void;
    teardown(): void;
    onSignal(signal: string, data?: any): void;
    _changeState(timeSinceStart: number, nextStateName: string, nextStateParams: any): void;
}
/**
  Creates a transition table for use with StateMachine.
  Example:
    const transitions = {
      start: entity.makeTransitionTable({
        win: "end",
        lose: "start",
      }),
    };
    `
*/
export declare function makeTransitionTable(table: {
    [key: string]: string;
}): {
    (requestedTransitionName: string, requestedTransitionParams: any, previousStateName: string, previousStateParams: any): any;
    table: {
        [key: string]: string;
    };
};
export declare class CompositeEntity extends Entity {
    entities: Entity[];
    constructor(entities?: Entity[]);
    setup(config: any): void;
    update(options: any): void;
    teardown(): void;
    onSignal(signal: string, data?: any): void;
    addEntity(entity: Entity): void;
    removeEntity(entity: Entity): void;
}
/**
  An entity that gets its behavior from functions provided inline in the constructor.
  Useful for small entities that don't require their own class definition.
  Additionally, a function called requestTransition(options, entity), called after update(), can set the requested transition

  Example usage:
    new FunctionalEntity({
      setup: (config) => console.log("setup", config),
      teardown: () => console.log("teardown"),
    });
*/
export declare class FunctionalEntity extends ParallelEntity {
    functions: {
        setup: (config: any, entity: FunctionalEntity) => void;
        update: (options: any, entity: FunctionalEntity) => void;
        teardown: (entity: FunctionalEntity) => void;
        onSignal: (signal: string, data?: any) => void;
        requestTransition?: any;
    };
    constructor(functions: {
        setup: (config: any, entity: FunctionalEntity) => void;
        update: (options: any, entity: FunctionalEntity) => void;
        teardown: (entity: FunctionalEntity) => void;
        onSignal: (signal: string, data?: any) => void;
        requestTransition?: any;
    }, childEntities?: Entity[]);
    setup(config: any): void;
    update(options: any): void;
    teardown(): void;
    onSignal(signal: string, data?: any): void;
}
/**
  An entity that calls a provided function just once (in setup), and immediately requests a transition.
  Optionally takes a @that parameter, which is set as _this_ during the call.
*/
export declare class FunctionCallEntity extends Entity {
    f: (arg: any) => any;
    that: any;
    constructor(f: (arg: any) => any, that: any);
    _setup(): void;
}
export declare class WaitingEntity extends Entity {
    wait: number;
    /** @wait is in milliseconds */
    constructor(wait: number);
    _update(options: any): void;
}
/**
  An entity that manages a PIXI DisplayObject, such as a Sprite or Graphics.
  Useful for automatically adding and removing the DisplayObject to the parent container.
*/
export declare class DisplayObjectEntity extends Entity {
    displayObject: any;
    constructor(displayObject: any);
    _setup(config: any): void;
    _teardown(): void;
}
/**
  An entity that creates a new PIXI container in the setup config for it's children, and manages the container.
*/
export declare class ContainerEntity extends ParallelEntity {
    name?: string;
    oldConfig: any;
    newConfig: any;
    container: PIXI.Container;
    constructor(entities?: Entity[], name?: string);
    setup(config: any): void;
    teardown(): void;
}
/**
  Manages a video asset. Can optionally loop the video.
  Asks for a transition when the video has ended.
*/
export declare class VideoEntity extends Entity {
    videoName: string;
    container: PIXI.Container;
    videoElement: any;
    videoSprite: any;
    loop: boolean;
    constructor(videoName: string, options?: any);
    _setup(config: EntityConfig): void;
    _update(options: any): void;
    _onSignal(signal: string, data?: any): void;
    teardown(): void;
    _startVideo(): void;
}
/**
  Creates a toggle switch that has different textures in the "off" and "on" positions.
*/
export declare class ToggleSwitch extends Entity {
    container: PIXI.Container;
    spriteOn: PIXI.Sprite;
    spriteOff: PIXI.Sprite;
    position: PIXI.IPoint;
    onTexture: PIXI.Texture;
    offTexture: PIXI.Texture;
    isOn: boolean;
    constructor(options: any);
    setup(options: any): void;
    teardown(): void;
    setIsOn(isOn: boolean, silent?: boolean): void;
    _turnOff(): void;
    _turnOn(): void;
    _updateVisibility(): void;
}
/**
  Manages an animated sprite in PIXI, pausing the sprite during pauses.

  When the animation completes (if the animation is not set to loop, then this will request a transition)
*/
export declare class AnimatedSpriteEntity extends Entity {
    animatedSprite: PIXI.AnimatedSprite;
    constructor(animatedSprite: PIXI.AnimatedSprite);
    _setup(): void;
    onSignal(signal: string, data?: any): void;
    _teardown(): void;
    _onAnimationComplete(): void;
}
export declare class SkipButton extends Entity {
    sprite: PIXI.Sprite;
    setup(config: EntityConfig): void;
    teardown(): void;
    _onSkip(): void;
}
/**
  Similar in spirit to ParallelEntity, but does not hold onto entities that have completed.
  Instead, entities that have completed are removed after teardown
*/
export declare class DeflatingCompositeEntity extends Entity {
    entities: Entity[];
    autoTransition: boolean;
    /** Options include:
          autoTransition: If true, requests transition when the entity has no children (default true)
    */
    constructor(options?: any);
    setup(config: any): void;
    update(options: any): void;
    teardown(): void;
    onSignal(signal: string, data?: any): void;
    addEntity(entity: Entity): void;
    removeEntity(entity: Entity): void;
}
/**
 * Does not request a transition until done() is called with a given transition
 */
export declare class Block extends Entity {
    done(transition?: boolean): void;
}
/**
 * Executes a function once and requests a transition equal to its value.
 */
export declare class Decision extends Entity {
    private f;
    constructor(f: () => boolean);
    _setup(): void;
}
/**
 * Waits for an event to be delivered, and decides to request a transition depending on the event value.
 * @handler is a function of the event arguments, and should return a transition (or false if no transition)
 */
export declare class WaitForEvent extends Entity {
    emitter: PIXI.utils.EventEmitter;
    eventName: string;
    handler: (...args: any) => boolean;
    constructor(emitter: PIXI.utils.EventEmitter, eventName: string, handler?: (...args: any) => boolean);
    _setup(): void;
    _handleEvent(...args: any): void;
}
/**
 * A composite entity that requests a transition as soon as one of it's children requests one
 */
export declare class Alternative extends Entity {
    entityPairs: {
        entity: Entity;
        transition: string;
    }[];
    constructor(entityPairs?: (Entity | {
        entity: Entity;
        transition: string;
    })[]);
    _setup(): void;
    _update(options: any): void;
    _teardown(): void;
}
/**
 * A composite entity in which only entity is active at a time.
 * By default, the first entity is active
 */
export declare class SwitchingEntity extends Entity {
    entities: Entity[];
    entityConfigs: any[];
    activeEntityIndex: number;
    constructor();
    setup(config: any): void;
    update(options: any): void;
    teardown(): void;
    onSignal(signal: string, data?: any): void;
    addEntity(entity: Entity, config?: any): void;
    switchToIndex(index: number): void;
    switchToEntity(entity: Entity): void;
    activeEntity(): Entity;
    removeEntity(entity: Entity): void;
    removeAllEntities(): void;
}
export declare function processEntityConfig(config: EntityConfig, alteredConfig: EntityConfig | ((c: EntityConfig) => EntityConfig)): EntityConfig;
export declare function extendConfig(values: any): (c: EntityConfig) => EntityConfig;
