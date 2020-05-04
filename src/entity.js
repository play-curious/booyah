import _, { partition } from 'underscore';
import * as util from './util';
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
export class Entity extends PIXI.utils.EventEmitter {
    constructor() {
        super(...arguments);
        this.isSetup = false;
        this.eventListeners = [];
    }
    setup(config) {
        if (this.isSetup) {
            console.error("setup() called twice", this);
            console.trace();
        }
        this.config = config;
        this.isSetup = true;
        this.requestedTransition = null;
        this._setup(config);
    }
    update(options) {
        if (!this.isSetup) {
            console.error("update() called before setup()", this);
            console.trace();
        }
        this._update(options);
    }
    teardown(options) {
        if (!this.isSetup) {
            console.error("teardown() called before setup()", this);
            console.trace();
        }
        this._teardown(options);
        this._off(); // Remove all event listeners
        this.config = null;
        this.isSetup = false;
    }
    onSignal(signal, data) {
        if (!this.config) {
            console.error("onSignal() called before setup()", this);
        }
        this._onSignal(signal, data);
    }
    _on(emitter, event, cb) {
        this.eventListeners.push({ emitter, event, cb });
        emitter.on(event, cb, this);
    }
    // if @cb is null, will remove all event listeners for the given emitter and event
    _off(emitter, event, cb) {
        const props = {
            emitter, event, cb
        };
        const [listenersToRemove, listenersToKeep] = partition(this.eventListeners, props);
        for (const listener of listenersToRemove)
            listener.emitter.off(listener.event, listener.cb, this);
        this.eventListeners = listenersToKeep;
    }
    _setup(config) { }
    _update(options) { }
    _teardown(options) { }
    _onSignal(signal, data) { }
    static processEntityConfig(config, alteredConfig) {
        if (!alteredConfig)
            return config;
        if (typeof alteredConfig == 'function')
            return alteredConfig(config);
        return alteredConfig;
    }
    static extendConfig(values) {
        return config => _.extend({}, config, values);
    }
}
/** Empty class just to indicate an entity that does nothing and never requests a transition  */
export class NullEntity extends Entity {
}
/** An entity that returns the requested transition immediately  */
export class TransitoryEntity extends Entity {
    constructor(transition = true) {
        super();
        this.transition = transition;
    }
    _setup() {
        this.requestedTransition = this.transition;
    }
}
/**
 Allows a bunch of entities to execute in parallel.
 Updates child entities until they ask for a transition, at which point they are torn down.
 If autoTransition=true, requests a transition when all child entities have completed.
 */
export class ParallelEntity extends Entity {
    /**
     @entities can be subclasses of entity.Entity or an object like { entity:, config: }
     @options:
     * autoTransition: Should the entity request a transition when all the child entities are done?  (defaults to false)
     */
    constructor(entities = [], options = {}) {
        super();
        this.entities = [];
        this.entityConfigs = [];
        this.entityIsActive = [];
        this.autoTransition = false;
        util.setupOptions(this, options, {
            autoTransition: false
        });
        for (const currentEntity of entities) {
            if (currentEntity instanceof Entity) {
                this.addEntity(currentEntity);
            }
            else {
                this.addEntity(currentEntity.entity, currentEntity.config);
            }
        }
    }
    setup(config) {
        super.setup(config);
        for (let i = 0; i < this.entities.length; i++) {
            const entity = this.entities[i];
            if (!entity.isSetup) {
                const entityConfig = ParallelEntity.processEntityConfig(this.config, this.entityConfigs[i]);
                entity.setup(entityConfig);
            }
            this.entityIsActive[i] = true;
        }
    }
    update(options) {
        super.update(options);
        for (let i = 0; i < this.entities.length; i++) {
            if (this.entityIsActive[i]) {
                const entity = this.entities[i];
                entity.update(options);
                if (entity.requestedTransition) {
                    entity.teardown();
                    this.entityIsActive[i] = false;
                }
            }
        }
        if (this.autoTransition && !_.some(this.entityIsActive))
            this.requestedTransition = true;
    }
    teardown() {
        for (let i = 0; i < this.entities.length; i++) {
            if (this.entityIsActive[i]) {
                this.entities[i].teardown();
                this.entityIsActive[i] = false;
            }
        }
        super.teardown();
    }
    onSignal(signal, data) {
        super.onSignal(signal, data);
        for (let i = 0; i < this.entities.length; i++) {
            if (this.entityIsActive[i])
                this.entities[i].onSignal(signal, data);
        }
    }
    // If config is provided, it will overload the config provided to this entity by setup()
    addEntity(entity, config = null) {
        this.entities.push(entity);
        this.entityConfigs.push(config);
        this.entityIsActive.push(true);
        // If we have already been setup, setup this new entity
        if (this.isSetup && !entity.isSetup) {
            const entityConfig = ParallelEntity.processEntityConfig(this.config, config);
            entity.setup(entityConfig);
        }
    }
    removeEntity(entity) {
        const index = this.entities.indexOf(entity);
        if (index === -1)
            throw new Error("Cannot find entity to remove");
        if (entity.isSetup) {
            entity.teardown();
        }
        this.entities.splice(index, 1);
        this.entityConfigs.splice(index, 1);
        this.entityIsActive.splice(index, 1);
    }
    removeAllEntities() {
        for (const entity of this.entities) {
            if (entity.isSetup) {
                entity.teardown();
            }
            this.entities = [];
            this.entityConfigs = [];
            this.entityIsActive = [];
        }
    }
}
/**
  Runs one child entity after another.
  When done, requestes the last transition demanded.
  Optionally can loop back to the first entity.
*/
export class EntitySequence extends Entity {
    constructor(entities, options = {}) {
        super();
        this.entities = entities;
        this.currentEntityIndex = 0;
        this.currentEntity = null;
        this.loop = !!options.loop;
    }
    // Does not setup entity
    addEntity(entity) {
        if (this.requestedTransition)
            return;
        this.entities.push(entity);
    }
    skip() {
        if (this.requestedTransition)
            return;
        this._advance({ name: "skip" });
    }
    setup(config) {
        super.setup(config);
        this.currentEntityIndex = 0;
        this.currentEntity = null;
        this._activateEntity(0);
    }
    update(options) {
        super.update(options);
        if (this.lastRequestedTransition)
            return;
        const timeSinceChildStart = options.timeSinceStart - this.childStartedAt;
        const childOptions = _.extend({}, options, {
            timeSinceStart: timeSinceChildStart
        });
        this.lastUpdateOptions = options;
        if (this.currentEntityIndex >= this.entities.length)
            return;
        this.currentEntity.update(childOptions);
        const transition = this.currentEntity.requestedTransition;
        if (transition)
            this._advance(transition);
    }
    teardown() {
        this._deactivateEntity();
        super.teardown();
    }
    onSignal(signal, data) {
        if (this.requestedTransition)
            return;
        super.onSignal(signal, data);
        this.currentEntity.onSignal(signal, data);
        if (signal === "reset")
            this.restart();
    }
    restart() {
        this._deactivateEntity();
        this.currentEntityIndex = 0;
        this.requestedTransition = false;
        this._activateEntity(0);
    }
    _activateEntity(time) {
        const entityDescriptor = this.entities[this.currentEntityIndex];
        if (_.isFunction(entityDescriptor)) {
            this.currentEntity = entityDescriptor(this);
        }
        else {
            this.currentEntity = entityDescriptor;
        }
        this.currentEntity.setup(this.config);
        this.childStartedAt = time;
    }
    _deactivateEntity() {
        if (this.currentEntity && this.currentEntity.isSetup)
            this.currentEntity.teardown();
    }
    _advance(transition) {
        if (this.currentEntityIndex < this.entities.length - 1) {
            this._deactivateEntity();
            this.currentEntityIndex = this.currentEntityIndex + 1;
            this._activateEntity(this.lastUpdateOptions.timeSinceStart);
        }
        else if (this.loop) {
            this._deactivateEntity();
            this.currentEntityIndex = 0;
            this._activateEntity(this.lastUpdateOptions.timeSinceStart);
        }
        else {
            this._deactivateEntity();
            this.requestedTransition = transition;
        }
    }
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
export class StateMachine extends Entity {
    constructor(states, transitions, options = {}) {
        super();
        this.states = states;
        this.transitions = transitions;
        util.setupOptions(this, options, {
            startingState: "start",
            endingStates: ["end"],
            startingStateParams: {},
            startingProgress: {}
        });
    }
    setup(config) {
        super.setup(config);
        this.visitedStates = [];
        this.progress = util.cloneData(this.startingProgress);
        const startingState = _.isFunction(this.startingState)
            ? this.startingState()
            : this.startingState;
        const startingStateParams = _.isFunction(this.startingStateParams)
            ? this.startingStateParams()
            : this.startingStateParams;
        this._changeState(0, startingState, startingStateParams);
    }
    update(options) {
        super.update(options);
        if (!this.state)
            return;
        const timeSinceStateStart = options.timeSinceStart - this.sceneStartedAt;
        const stateOptions = _.extend({}, options, {
            timeSinceStart: timeSinceStateStart
        });
        this.state.update(stateOptions);
        const requestedTransition = this.state.requestedTransition;
        if (requestedTransition) {
            // Unpack requested transition
            let requestedTransitionName, requestedTransitionParams;
            if (_.isObject(requestedTransition)) {
                requestedTransitionName = requestedTransition.name;
                requestedTransitionParams = requestedTransition.params;
            }
            else {
                requestedTransitionName = requestedTransition;
            }
            let nextStateDescriptor;
            // The transition could directly be the name of another state
            if (_.isString(requestedTransitionName) &&
                requestedTransitionName in this.states &&
                !(this.stateName in this.transitions)) {
                nextStateDescriptor = requestedTransition;
            }
            else if (!(this.stateName in this.transitions)) {
                throw new Error(`Cannot find transition for state '${this.stateName}'`);
            }
            else {
                const transitionDescriptor = this.transitions[this.stateName];
                if (_.isFunction(transitionDescriptor)) {
                    nextStateDescriptor = transitionDescriptor(requestedTransitionName, requestedTransitionParams, this);
                }
                else if (_.isString(transitionDescriptor)) {
                    nextStateDescriptor = transitionDescriptor;
                }
                else {
                    throw new Error(`Cannot decode transition descriptor '${JSON.stringify(transitionDescriptor)}'`);
                }
            }
            // Unpack the next state
            let nextStateName, nextStateParams;
            if (_.isObject(nextStateDescriptor) &&
                _.isString(nextStateDescriptor.name)) {
                nextStateName = nextStateDescriptor.name;
                nextStateParams = nextStateDescriptor.params;
            }
            else if (_.isString(nextStateDescriptor)) {
                nextStateName = nextStateDescriptor;
                nextStateParams = requestedTransition.params; // By default, pass through the params in the requested transition
            }
            else {
                throw new Error(`Cannot decode state descriptor '${JSON.stringify(nextStateDescriptor)}'`);
            }
            this._changeState(options.timeSinceStart, nextStateName, nextStateParams);
        }
    }
    teardown() {
        if (this.state) {
            this.state.teardown();
            this.state = null;
            this.stateName = null;
        }
        super.teardown();
    }
    onSignal(signal, data) {
        super.onSignal(signal, data);
        if (this.state)
            this.state.onSignal(signal, data);
    }
    _changeState(timeSinceStart, nextStateName, nextStateParams) {
        // If reached an ending state, stop here. Teardown can happen later
        if (_.contains(this.endingStates, nextStateName)) {
            this.requestedTransition = nextStateName;
            this.visitedStates.push(nextStateName);
            return;
        }
        if (this.state) {
            this.state.teardown();
        }
        if (nextStateName in this.states) {
            const nextStateDescriptor = this.states[nextStateName];
            if (_.isFunction(nextStateDescriptor)) {
                this.state = nextStateDescriptor(nextStateParams, this);
            }
            else {
                this.state = nextStateDescriptor;
            }
            this.state.setup(this.config);
        }
        else {
            throw new Error(`Cannot find state '${nextStateName}'`);
        }
        this.sceneStartedAt = timeSinceStart;
        const previousStateName = this.stateName;
        const previousStateParams = this.stateParams;
        this.stateName = nextStateName;
        this.stateParams = nextStateParams;
        this.visitedStates.push(nextStateName);
        this.emit("stateChange", nextStateName, nextStateParams, previousStateName, previousStateParams);
    }
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
export function makeTransitionTable(table) {
    const f = function (requestedTransitionName, requestedTransitionParams, previousStateName, previousStateParams) {
        if (requestedTransitionName in table) {
            const transitionDescriptor = table[requestedTransitionName];
            if (_.isFunction(transitionDescriptor)) {
                return transitionDescriptor(requestedTransitionName, requestedTransitionParams, previousStateName, previousStateParams);
            }
            else {
                return transitionDescriptor;
            }
        }
        else {
            throw new Error(`Cannot find state ${requestedTransitionName}`);
        }
    };
    f.table = table; // For debugging purposes
    return f;
}
/* Deprecated for most uses. Instead use ParallelEntity */
export class CompositeEntity extends Entity {
    constructor(entities = []) {
        super();
        this.entities = entities;
    }
    setup(config) {
        super.setup(config);
        for (const entity of this.entities) {
            if (!entity.isSetup) {
                entity.setup(config);
            }
        }
    }
    update(options) {
        super.update(options);
        for (const entity of this.entities) {
            entity.update(options);
        }
        if (this.entities.length && this.entities[0].requestedTransition) {
            this.requestedTransition = this.entities[0].requestedTransition;
        }
    }
    teardown() {
        for (const entity of this.entities) {
            entity.teardown();
        }
        super.teardown();
    }
    onSignal(signal, data) {
        super.onSignal(signal, data);
        for (const entity of this.entities) {
            entity.onSignal(signal, data);
        }
    }
    addEntity(entity) {
        // If we have already been setup, setup this new entity
        if (this.isSetup && !entity.isSetup) {
            entity.setup(this.config);
        }
        this.entities.push(entity);
    }
    removeEntity(entity) {
        const index = this.entities.indexOf(entity);
        if (index === -1)
            throw new Error("Cannot find entity to remove");
        if (entity.isSetup) {
            entity.teardown();
        }
        this.entities.splice(index, 1);
    }
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
export class FunctionalEntity extends ParallelEntity {
    // @functions is an object, with keys: setup, update, teardown, onSignal
    constructor(functions, childEntities = []) {
        super();
        this.functions = functions;
        for (let childEntity of childEntities)
            this.addEntity(childEntity);
    }
    setup(config) {
        super.setup(config);
        if (this.functions.setup)
            this.functions.setup(config, this);
    }
    update(options) {
        super.update(options);
        if (this.functions.update)
            this.functions.update(options, this);
        if (this.functions.requestTransition) {
            this.requestedTransition = this.functions.requestTransition(options, this);
        }
    }
    teardown() {
        if (this.functions.teardown)
            this.functions.teardown(this);
        super.teardown();
    }
    onSignal(signal, data) {
        super.onSignal(signal, data);
        if (this.functions.onSignal)
            this.functions.onSignal(signal, data);
    }
}
/**
  An entity that calls a provided function just once (in setup), and immediately requests a transition.
  Optionally takes a @that parameter, which is set as _this_ during the call.
*/
export class FunctionCallEntity extends Entity {
    constructor(f, that) {
        super();
        this.f = f;
        this.that = that;
        this.that = that && this;
    }
    _setup() {
        this.f.call(this.that);
        this.requestedTransition = true;
    }
}
// Waits until time is up, then requests transition
export class WaitingEntity extends Entity {
    /** @wait is in milliseconds */
    constructor(wait) {
        super();
        this.wait = wait;
    }
    _update(options) {
        if (options.timeSinceStart >= this.wait) {
            this.requestedTransition = true;
        }
    }
}
/**
  An entity that manages a PIXI DisplayObject, such as a Sprite or Graphics.
  Useful for automatically adding and removing the DisplayObject to the parent container.
*/
export class DisplayObjectEntity extends Entity {
    constructor(displayObject) {
        super();
        this.displayObject = displayObject;
    }
    _setup(config) {
        this.config.container.addChild(this.displayObject);
    }
    _teardown() {
        this.config.container.removeChild(this.displayObject);
    }
}
/**
  An entity that creates a new PIXI container in the setup config for it's children, and manages the container.
*/
export class ContainerEntity extends ParallelEntity {
    constructor(entities = [], name) {
        super(entities);
        this.name = name;
    }
    setup(config) {
        this.oldConfig = config;
        this.container = new PIXI.Container();
        this.container.name = this.name;
        this.oldConfig.container.addChild(this.container);
        this.newConfig = _.extend({}, config, {
            container: this.container
        });
        super.setup(this.newConfig);
    }
    teardown() {
        super.teardown();
        this.oldConfig.container.removeChild(this.container);
    }
}
/**
  Manages a video asset. Can optionally loop the video.
  Asks for a transition when the video has ended.
*/
export class VideoEntity extends Entity {
    constructor(videoName, options = {}) {
        super();
        this.videoName = videoName;
        util.setupOptions(this, options, {
            loop: false
        });
    }
    _setup(config) {
        // This container is used so that the video is inserted in the right place,
        // even if the sprite isn't added until later.
        this.container = new PIXI.Container();
        this.config.container.addChild(this.container);
        this.videoElement = this.config.videoAssets[this.videoName];
        this.videoElement.loop = this.loop;
        this.videoElement.currentTime = 0;
        this.videoSprite = null;
        // videoElement.play() might not return a promise on older browsers
        Promise.resolve(this.videoElement.play()).then(() => {
            // Including a slight delay seems to workaround a bug affecting Firefox
            window.setTimeout(() => this._startVideo(), 100);
        });
    }
    _update(options) {
        if (this.videoElement.ended)
            this.requestedTransition = true;
    }
    _onSignal(signal, data) {
        if (signal === "pause") {
            this.videoElement.pause();
        }
        else if (signal === "play") {
            this.videoElement.play();
        }
    }
    teardown() {
        this.videoElement.pause();
        this.videoSprite = null;
        this.config.container.removeChild(this.container);
        this.container = null;
        super.teardown();
    }
    _startVideo() {
        const videoResource = new PIXI.resources.VideoResource(this.videoElement);
        //@ts-ignore
        this.videoSprite = PIXI.Sprite.from(videoResource);
        this.container.addChild(this.videoSprite);
    }
}
/**
  Creates a toggle switch that has different textures in the "off" and "on" positions.
*/
export class ToggleSwitch extends Entity {
    constructor(options) {
        super();
        util.setupOptions(this, options, {
            onTexture: util.REQUIRED_OPTION,
            offTexture: util.REQUIRED_OPTION,
            isOn: false,
            position: new PIXI.Point()
        });
    }
    setup(options) {
        super.setup(options);
        this.container = new PIXI.Container();
        this.container.position = this.position;
        this.spriteOn = new PIXI.Sprite(this.onTexture);
        this.spriteOn.interactive = true;
        this._on(this.spriteOn, "pointertap", this._turnOff);
        this.container.addChild(this.spriteOn);
        this.spriteOff = new PIXI.Sprite(this.offTexture);
        this.spriteOff.interactive = true;
        this._on(this.spriteOff, "pointertap", this._turnOn);
        this.container.addChild(this.spriteOff);
        this._updateVisibility();
        this.config.container.addChild(this.container);
    }
    teardown() {
        this.config.container.removeChild(this.container);
        super.teardown();
    }
    setIsOn(isOn, silent = false) {
        this.isOn = isOn;
        this._updateVisibility();
        if (!silent)
            this.emit("change", this.isOn);
    }
    _turnOff() {
        this.isOn = false;
        this._updateVisibility();
        this.emit("change", this.isOn);
    }
    _turnOn() {
        this.isOn = true;
        this._updateVisibility();
        this.emit("change", this.isOn);
    }
    _updateVisibility() {
        this.spriteOn.visible = this.isOn;
        this.spriteOff.visible = !this.isOn;
    }
}
/**
  Manages an animated sprite in PIXI, pausing the sprite during pauses.

  When the animation completes (if the animation is not set to loop, then this will request a transition)
*/
export class AnimatedSpriteEntity extends Entity {
    constructor(animatedSprite) {
        super();
        this.animatedSprite = animatedSprite;
    }
    _setup() {
        if (this.animatedSprite.onComplete)
            console.warn("Warning: overwriting this.animatedSprite.onComplete");
        this.animatedSprite.onComplete = this._onAnimationComplete.bind(this);
        this.config.container.addChild(this.animatedSprite);
        this.animatedSprite.gotoAndPlay(0);
    }
    onSignal(signal, data) {
        if (signal == "pause")
            this.animatedSprite.stop();
        else if (signal == "play")
            this.animatedSprite.play();
    }
    _teardown() {
        this.animatedSprite.stop();
        this.animatedSprite.onComplete = null;
        this.config.container.removeChild(this.animatedSprite);
    }
    _onAnimationComplete() {
        this.requestedTransition = true;
    }
}
export class SkipButton extends Entity {
    setup(config) {
        super.setup(config);
        this.sprite = new PIXI.Sprite(this.config.app.loader.resources[this.config.directives.graphics.skip].texture);
        this.sprite.anchor.set(0.5);
        this.sprite.position.set(this.config.app.screen.width - 50, this.config.app.screen.height - 50);
        this.sprite.interactive = true;
        this._on(this.sprite, "pointertap", this._onSkip);
        this.config.container.addChild(this.sprite);
    }
    teardown() {
        this.config.container.removeChild(this.sprite);
        super.teardown();
    }
    _onSkip() {
        this.requestedTransition = true;
        this.emit("skip");
    }
}
/**
  Similar in spirit to ParallelEntity, but does not hold onto entities that have completed.
  Instead, entities that have completed are removed after teardown
*/
export class DeflatingCompositeEntity extends Entity {
    /** Options include:
          autoTransition: If true, requests transition when the entity has no children (default true)
    */
    constructor(options = {}) {
        super();
        this.entities = [];
        util.setupOptions(this, options, {
            autoTransition: true
        });
    }
    setup(config) {
        super.setup(config);
        for (const entity of this.entities) {
            if (!entity.isSetup) {
                entity.setup(config);
            }
        }
    }
    update(options) {
        super.update(options);
        // Slightly complicated for-loop so that we can remove entities that are complete
        for (let i = 0; i < this.entities.length;) {
            const entity = this.entities[i];
            entity.update(options);
            if (entity.requestedTransition) {
                console.debug("Cleanup up child entity", entity);
                if (entity.isSetup) {
                    entity.teardown();
                }
                this.entities.splice(i, 1);
            }
            else {
                i++;
            }
        }
        if (this.autoTransition && this.entities.length == 0) {
            this.requestedTransition = true;
        }
    }
    teardown() {
        for (const entity of this.entities) {
            entity.teardown();
        }
        super.teardown();
    }
    onSignal(signal, data) {
        super.onSignal(signal, data);
        for (const entity of this.entities) {
            entity.onSignal(signal, data);
        }
    }
    addEntity(entity) {
        // If we have already been setup, setup this new entity
        if (this.isSetup && !entity.isSetup) {
            entity.setup(this.config);
        }
        this.entities.push(entity);
    }
    removeEntity(entity) {
        const index = this.entities.indexOf(entity);
        if (index === -1)
            throw new Error("Cannot find entity to remove");
        if (entity.isSetup) {
            entity.teardown();
        }
        this.entities.splice(index, 1);
    }
}
/**
 * Does not request a transition until done() is called with a given transition
 */
export class Block extends Entity {
    done(transition = true) {
        this.requestedTransition = transition;
    }
}
/**
 * Executes a function once and requests a transition equal to its value.
 */
export class Decision extends Entity {
    constructor(f) {
        super();
        this.f = f;
    }
    _setup() {
        this.requestedTransition = this.f();
    }
}
/**
 * Waits for an event to be delivered, and decides to request a transition depending on the event value.
 * @handler is a function of the event arguments, and should return a transition (or false if no transition)
 */
export class WaitForEvent extends Entity {
    constructor(emitter, eventName, handler = _.constant(true)) {
        super();
        this.emitter = emitter;
        this.eventName = eventName;
        this.handler = handler;
    }
    _setup() {
        this._on(this.emitter, this.eventName, this._handleEvent);
    }
    _handleEvent(...args) {
        this.requestedTransition = this.handler(...args);
    }
}
/**
 * A composite entity that requests a transition as soon as one of it's children requests one
 */
export class Alternative extends Entity {
    // Takes an array of type: { entity, transition } or just entity
    // transition defaults to the string version of the index in the array (to avoid problem of 0 being considered as falsy)
    constructor(entityPairs = []) {
        super();
        this.entityPairs = _.map(entityPairs, (entityPair, key) => {
            if (entityPair instanceof Entity)
                return {
                    entity: entityPair,
                    transition: key.toString()
                };
            // Assume an object of type { entity, transition }
            return _.defaults({}, entityPair, {
                transition: key.toString()
            });
        });
    }
    _setup() {
        for (const entityPair of this.entityPairs) {
            entityPair.entity.setup(this.config);
            if (entityPair.entity.requestedTransition)
                this.requestedTransition = entityPair.transition;
        }
    }
    _update(options) {
        for (const entityPair of this.entityPairs) {
            entityPair.entity.update(options);
            if (entityPair.entity.requestedTransition)
                this.requestedTransition = entityPair.transition;
        }
    }
    _teardown() {
        for (const entityPair of this.entityPairs) {
            entityPair.entity.teardown();
        }
    }
}
/**
 * A composite entity in which only entity is active at a time.
 * By default, the first entity is active
 */
export class SwitchingEntity extends Entity {
    constructor() {
        super();
        this.entities = [];
        this.entityConfigs = [];
        this.activeEntityIndex = -1;
    }
    setup(config) {
        super.setup(config);
        if (this.entities && this.activeEntityIndex > 0) {
            this.switchToIndex(this.activeEntityIndex);
        }
    }
    update(options) {
        super.update(options);
        if (this.activeEntityIndex >= 0) {
            this.entities[this.activeEntityIndex].update(options);
        }
    }
    teardown() {
        this.switchToIndex(-1);
        super.teardown();
    }
    onSignal(signal, data) {
        super.onSignal(signal, data);
        if (this.activeEntityIndex >= 0) {
            this.entities[this.activeEntityIndex].onSignal(signal, data);
        }
    }
    // If config is provided, it will overload the config provided to this entity by setup()
    addEntity(entity, config) {
        this.entities.push(entity);
        this.entityConfigs.push(config);
    }
    switchToIndex(index) {
        if (this.activeEntityIndex >= 0) {
            this.entities[this.activeEntityIndex].teardown();
        }
        this.activeEntityIndex = index;
        if (this.activeEntityIndex >= 0) {
            const entityConfig = processEntityConfig(this.config, this.entityConfigs[this.activeEntityIndex]);
            this.entities[this.activeEntityIndex].setup(entityConfig);
        }
    }
    switchToEntity(entity) {
        if (entity === null) {
            this.switchToIndex(-1);
        }
        else {
            const index = this.entities.indexOf(entity);
            if (index === -1)
                throw new Error("Cannot find entity");
            this.switchToIndex(index);
        }
    }
    activeEntity() {
        if (this.activeEntityIndex >= 0)
            return this.entities[this.activeEntityIndex];
        return null;
    }
    removeEntity(entity) {
        const index = this.entities.indexOf(entity);
        if (index === -1)
            throw new Error("Cannot find entity");
        if (index === this.activeEntityIndex) {
            this.switchToIndex(-1);
        }
        this.entities.splice(index, 1);
        this.entityConfigs.splice(index, 1);
    }
    removeAllEntities() {
        this.switchToIndex(-1);
        this.entities = [];
        this.entityConfigs = [];
        this.activeEntityIndex = -1;
    }
}
export function processEntityConfig(config, alteredConfig) {
    if (!alteredConfig)
        return config;
    if (typeof alteredConfig == 'function')
        return alteredConfig(config);
    return alteredConfig;
}
export function extendConfig(values) {
    return (config) => _.extend({}, config, values);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZW50aXR5LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vdHlwZXNjcmlwdC9lbnRpdHkudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsT0FBTyxDQUFDLEVBQUUsRUFBQyxTQUFTLEVBQUMsTUFBTSxZQUFZLENBQUM7QUFDeEMsT0FBTyxLQUFLLElBQUksTUFBTSxRQUFRLENBQUM7QUFRL0I7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7R0FzQkc7QUFDSCxNQUFNLE9BQWdCLE1BQU8sU0FBUSxJQUFJLENBQUMsS0FBSyxDQUFDLFlBQVk7SUFBNUQ7O1FBRVMsWUFBTyxHQUFHLEtBQUssQ0FBQztRQUNoQixtQkFBYyxHQUF5QixFQUFFLENBQUM7SUF3Rm5ELENBQUM7SUFwRlEsS0FBSyxDQUFFLE1BQVU7UUFFdEIsSUFBSSxJQUFJLENBQUMsT0FBTyxFQUFFO1lBQ2hCLE9BQU8sQ0FBQyxLQUFLLENBQUMsc0JBQXNCLEVBQUUsSUFBSSxDQUFDLENBQUM7WUFDNUMsT0FBTyxDQUFDLEtBQUssRUFBRSxDQUFDO1NBQ2pCO1FBRUQsSUFBSSxDQUFDLE1BQU0sR0FBRyxNQUFNLENBQUM7UUFDckIsSUFBSSxDQUFDLE9BQU8sR0FBRyxJQUFJLENBQUM7UUFDcEIsSUFBSSxDQUFDLG1CQUFtQixHQUFHLElBQUksQ0FBQztRQUVoQyxJQUFJLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxDQUFDO0lBQ3RCLENBQUM7SUFFTSxNQUFNLENBQUUsT0FBVztRQUV4QixJQUFJLENBQUMsSUFBSSxDQUFDLE9BQU8sRUFBRTtZQUNqQixPQUFPLENBQUMsS0FBSyxDQUFDLGdDQUFnQyxFQUFFLElBQUksQ0FBQyxDQUFDO1lBQ3RELE9BQU8sQ0FBQyxLQUFLLEVBQUUsQ0FBQztTQUNqQjtRQUVELElBQUksQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLENBQUM7SUFDeEIsQ0FBQztJQUVNLFFBQVEsQ0FBRSxPQUFZO1FBQzNCLElBQUksQ0FBQyxJQUFJLENBQUMsT0FB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