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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZW50aXR5LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vdHlwZXNjcmlwdC9lbnRpdHkudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsT0FBTyxDQUFDLEVBQUUsRUFBQyxTQUFTLEVBQUMsTUFBTSxZQUFZLENBQUM7QUFDeEMsT0FBTyxLQUFLLElBQUksTUFBTSxRQUFRLENBQUM7QUEwQy9COzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0dBc0JHO0FBQ0gsTUFBTSxPQUFnQixNQUFPLFNBQVEsSUFBSSxDQUFDLEtBQUssQ0FBQyxZQUFZO0lBQTVEOztRQUVTLFlBQU8sR0FBRyxLQUFLLENBQUM7UUFDaEIsbUJBQWMsR0FBb0IsRUFBRSxDQUFDO0lBd0Y5QyxDQUFDO0lBcEZRLEtBQUssQ0FBRSxNQUFhO1FBRXpCLElBQUksSUFBSSxDQUFDLE9BQU8sRUFBRTtZQUNoQixPQUFPLENBQUMsS0FBSyxDQUFDLHNCQUFzQixFQUFFLElBQUksQ0FBQyxDQUFDO1lBQzVDLE9BQU8sQ0FBQyxLQUFLLEVBQUUsQ0FBQztTQUNqQjtRQUVELElBQUksQ0FBQyxNQUFNLEdBQUcsTUFBTSxDQUFDO1FBQ3JCLElBQUksQ0FBQyxPQUFPLEdBQUcsSUFBSSxDQUFDO1FBQ3BCLElBQUksQ0FBQyxtQkFBbUIsR0FBRyxJQUFJLENBQUM7UUFFaEMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsQ0FBQztJQUN0QixDQUFDO0lBRU0sTUFBTSxDQUFFLE9BQWU7UUFFNUIsSUFBSSxDQUFDLElBQUksQ0FBQyxPQUFPLEVBQUU7WUFDakIsT0FBTyxDQUFDLEtBQUssQ0FBQyxnQ0FBZ0MsRUFBRSxJQUFJLENBQUMsQ0FBQztZQUN0RCxPQUFPLENBQUMsS0FBSyxFQUFFLENBQUM7U0FDakI7UUFFRCxJQUFJLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxDQUFDO0lBQ3hCLENBQUM7SUFFTSxRQUFRLENBQUUsT0FBWTtRQUMzQixJQUFJLENBQUMsSUFBSSxDQUFDLE9B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