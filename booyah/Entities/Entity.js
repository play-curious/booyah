"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const PIXI = require("pixi.js-legacy");
const underscore_1 = require("underscore");
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
class Entity extends PIXI.utils.EventEmitter {
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
        const props = {};
        if (emitter)
            props.emitter = emitter;
        if (event)
            props.event = event;
        if (cb)
            props.cb = cb;
        const [listenersToRemove, listenersToKeep] = underscore_1.partition(this.eventListeners, props);
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
        return config => underscore_1.default.extend({}, config, values);
    }
}
exports.default = Entity;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiRW50aXR5LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc3JjL0VudGl0aWVzL0VudGl0eS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQUFBLHVDQUF1QztBQUN2QywyQ0FBd0M7QUEyQnhDOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0VBc0JFO0FBQ0YsTUFBOEIsTUFBTyxTQUFRLElBQUksQ0FBQyxLQUFLLENBQUMsWUFBWTtJQUFwRTs7UUFFVyxZQUFPLEdBQUcsS0FBSyxDQUFDO1FBQ2hCLG1CQUFjLEdBQW1CLEVBQUUsQ0FBQTtJQTJGOUMsQ0FBQztJQXZGVSxLQUFLLENBQUUsTUFBbUI7UUFFN0IsSUFBSSxJQUFJLENBQUMsT0FBTyxFQUFFO1lBQ2QsT0FBTyxDQUFDLEtBQUssQ0FBQyxzQkFBc0IsRUFBRSxJQUFJLENBQUMsQ0FBQztZQUM1QyxPQUFPLENBQUMsS0FBSyxFQUFFLENBQUM7U0FDbkI7UUFFRCxJQUFJLENBQUMsTUFBTSxHQUFHLE1BQU0sQ0FBQztRQUNyQixJQUFJLENBQUMsT0FBTyxHQUFHLElBQUksQ0FBQztRQUNwQixJQUFJLENBQUMsbUJBQW1CLEdBQUcsSUFBSSxDQUFDO1FBRWhDLElBQUksQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUM7SUFDeEIsQ0FBQztJQUVNLE1BQU0sQ0FBRSxPQUFxQjtRQUVoQyxJQUFJLENBQUMsSUFBSSxDQUFDLE9BQU8sRUFBRTtZQUNmLE9BQU8sQ0FBQyxLQUFLLENBQUMsZ0NBQWdDLEVBQUUsSUFBSSxDQUFDLENBQUM7WUFDdEQsT0FBTyxDQUFDLEtBQUssRUFBRSxDQUFDO1NBQ25CO1FBRUQsSUFBSSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsQ0FBQztJQUMxQixDQUFDO0lBRU0sUUFBUSxDQUFFLE9BQXdCO1FBQ3JDLElBQUksQ0FBQyxJQUFJLENBQUMsT0FBTyxFQUFFO1lBQ2YsT0FBTyxDQUFDLEtBQUssQ0FBQyxrQ0FBa0MsRUFBRSxJQUFJLENBQUMsQ0FB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