"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const PIXI = require("pixi.js-legacy");
const underscore_1 = require("underscore");
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
}
exports.default = Entity;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiRW50aXR5LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc3JjL0VudGl0aWVzL0VudGl0eS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQUFBLHVDQUF1QztBQUN2QywyQ0FBcUM7QUF1QnJDLE1BQThCLE1BQU8sU0FBUSxJQUFJLENBQUMsS0FBSyxDQUFDLFlBQVk7SUFBcEU7O1FBRVcsWUFBTyxHQUFHLEtBQUssQ0FBQztRQUNoQixtQkFBYyxHQUFtQixFQUFFLENBQUE7SUE0RTlDLENBQUM7SUFuRVUsS0FBSyxDQUFFLE1BQW1CO1FBRTdCLElBQUksSUFBSSxDQUFDLE9BQU8sRUFBRTtZQUNkLE9BQU8sQ0FBQyxLQUFLLENBQUMsc0JBQXNCLEVBQUUsSUFBSSxDQUFDLENBQUM7WUFDNUMsT0FBTyxDQUFDLEtBQUssRUFBRSxDQUFDO1NBQ25CO1FBRUQsSUFBSSxDQUFDLE1BQU0sR0FBRyxNQUFNLENBQUM7UUFDckIsSUFBSSxDQUFDLE9BQU8sR0FBRyxJQUFJLENBQUM7UUFDcEIsSUFBSSxDQUFDLG1CQUFtQixHQUFHLElBQUksQ0FBQztRQUVoQyxJQUFJLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxDQUFDO0lBQ3hCLENBQUM7SUFFTSxNQUFNLENBQUUsT0FBcUI7UUFFaEMsSUFBSSxDQUFDLElBQUksQ0FBQyxPQUFPLEVBQUU7WUFDZixPQUFPLENBQUMsS0FBSyxDQUFDLGdDQUFnQyxFQUFFLElBQUksQ0FBQyxDQUFDO1lBQ3RELE9BQU8sQ0FBQyxLQUFLLEVBQUUsQ0FBQztTQUNuQjtRQUVELElBQUksQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLENBQUM7SUFDMUIsQ0FBQztJQUVNLFFBQVEsQ0FBRSxPQUF1QjtRQUNwQyxJQUFJLENBQUMsSUFBSSxDQUFDLE9BQU8sRUFBRTtZQUNmLE9BQU8sQ0FBQyxLQUFLLENBQUMsa0NBQWtDLEVBQUUsSUFBSSxDQUFDLENBQUM7WUFDeEQsT0FBTyxDQUFDLEtBQUssRUFBRSxDQUFDO1NBQ25CO1FBRUQsSUFBSSxDQUFDLFNBQVMsQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUV4QixJQUFJLENBQUMsSUFBSSxFQUFFLENBQUMsQ0FBQyw2QkFBNkI7UUFFMUMsSUFBSSxDQUFDLE1BQU0sR0FBRyxJQUFJLENBQUM7UUFDbkIsSUFBSSxDQUFDLE9BQU8sR0FBRyxLQUFLLENBQUM7SUFDekIsQ0FBQztJQUVNLFFBQVEsQ0FBRSxNQUFhLEVBQUUsSUFBUztRQUNyQyxJQUFJLENBQUMsSUFBSSxDQUFDLE1BQU0sRUFBRTtZQUNkLE9BQU8sQ0FBQyxLQUFLLENBQUMsa0NBQWtDLEVBQUUsSUFBSSxDQUFDLENBQUM7U0FDM0Q7UUFFRCxJQUFJLENBQUMsU0FBUyxDQUFDLE1BQU0sRUFBRSxJQUFJLENBQUMsQ0FBQztJQUNqQyxDQUFDO0lBRVMsR0FBRyxDQUFDLE9BQStCLEVBQUUsS0FBWSxFQUFFLEVBQVc7UUFDcEUsSUFBSSxDQUFDLGNBQWMsQ0FBQyxJQUFJLENBQUMsRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDakQsT0FBTyxDQUFDLEVBQUUsQ0FBQyxLQUFLLEVBQUUsRUFBRSxFQUFFLElBQUksQ0FBQyxDQUFDO0lBQ2hDLENBQUM7SUFFRCxrRkFBa0Y7SUFDeEUsSUFBSSxDQUFDLE9BQWdDLEVBQUUsS0FBYSxFQUFFLEVBQVk7UUFDeEUsTUFBTSxLQUFLLEdBQWlCLEVBQUUsQ0FBQztRQUMvQixJQUFJLE9BQU87WUFBRSxLQUFLLENBQUMsT0FBTyxHQUFHLE9BQU8sQ0FBQztRQUNyQyxJQUFJLEtBQUs7WUFBRSxLQUFLLENBQUMsS0FBSyxHQUFHLEtBQUssQ0FBQztRQUMvQixJQUFJLEVBQUU7WUFBRSxLQUFLLENBQUMsRUFBRSxHQUFHLEVBQUUsQ0FBQztRQUV0QixNQUFNLENBQUMsaUJBQWlCLEVBQUUsZUFBZSxDQUFDLEdBQUcsc0JBQVMsQ0FDbEQsSUFBSSxDQUFDLGNBQWMsRUFDbkIsS0FBWSxDQUNmLENBQUM7UUFDRixLQUFLLE1BQU0sUUFBUSxJQUFJLGlCQUFpQjtZQUNwQyxRQUFRLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsS0FBSyxFQUFFLFFBQVEsQ0FBQyxFQUFFLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFFNUQsSUFBSSxDQUFDLGNBQWMsR0FBRyxlQUFlLENBQUM7SUFDMUMsQ0FBQztDQUNKO0FBL0VELHlCQStFQyJ9