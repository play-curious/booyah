import * as util from "./util";
import * as geom from "./geom";
import * as entity from "./entity";
import * as easing from "./easing";
import * as _ from "underscore";
/**
 * Creates a ParallelEntity that carries out multiple tweens on the same object.
 * Usage: tween.make(filter, { brightness: { to: 5 } }, { duration: 2000 })
 * @obj Object on which to carry out the tween
 * @props Map of property names to options for that property (like Tween() would take)
 * @options Default options for all properties, if not overridden by @props
 */
export function make(obj, props, options) {
    const tweens = [];
    for (const key in props) {
        const tweenOptions = _.defaults({ obj, property: key }, props[key], options);
        tweens.push(new Tween(tweenOptions));
    }
    return new entity.ParallelEntity(tweens, { autoTransition: true });
}
/**
 * Events:
 *  updatedValue(value)
 */
export class Tween extends entity.Entity {
    /**
     * Takes the following options:
     * @obj - an actual object, a function that returns an object, or null (in which case the value is internal only)
     * @property - a string property name, or null if no @obj is set
     * @from - defaults to current value
     * @to - required
     * @duration - Time in ms. Defaults to 1000
     * @easing - Function of t in [0, 1]. Defaults to easing.linear
     * @interpolate - Function to use for setting a new value.
     *  Depends on data type, such as color, vector, angle, ...
     **/
    constructor(options) {
        super();
        util.setupOptions(this, options, {
            obj: null,
            property: null,
            from: null,
            to: util.REQUIRED_OPTION,
            duration: 1000,
            easing: easing.linear,
            interpolate: interpolation.scalar
        });
    }
    _setup() {
        this.currentObj = _.isFunction(this.obj) ? this.obj() : this.obj;
        if (this.from) {
            this.startValue = this.from;
            this.value = this.startValue;
            this._updateValue();
        }
        else {
            this.startValue = this._getValue();
            this.value = this.startValue;
        }
        this.startTime = null;
    }
    _update(options) {
        if (this.startTime === null)
            this.startTime = options.timeSinceStart;
        if (options.timeSinceStart - this.startTime >= this.duration) {
            this.requestedTransition = true;
            // Snap to end
            this.value = this.to;
            this._updateValue();
        }
        else {
            const easedProgress = this.easing((options.timeSinceStart - this.startTime) / this.duration);
            this.value = this.interpolate(this.startValue, this.to, easedProgress);
            this._updateValue();
        }
    }
    _getValue() {
        return this.currentObj[this.property];
    }
    _updateValue() {
        if (this.currentObj)
            this.currentObj[this.property] = this.value;
        this.emit("updatedValue", this.value);
    }
}
/**
 * Interpolation functions with a signature of (fromValue, toValue, easedProgress)
 */
export const interpolation = {
    scalar: geom.lerp,
    color: geom.lerpColor,
    point: geom.lerpPoint,
    angle: geom.lerpAngle,
    array: geom.lerpArray
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidHdlZW4uanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi90eXBlc2NyaXB0L3R3ZWVuLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLE9BQU8sS0FBSyxJQUFJLE1BQU0sUUFBUSxDQUFDO0FBQy9CLE9BQU8sS0FBSyxJQUFJLE1BQU0sUUFBUSxDQUFDO0FBQy9CLE9BQU8sS0FBSyxNQUFNLE1BQU0sVUFBVSxDQUFDO0FBQ25DLE9BQU8sS0FBSyxNQUFNLE1BQU0sVUFBVSxDQUFDO0FBQ25DLE9BQU8sS0FBSyxDQUFDLE1BQU0sWUFBWSxDQUFDO0FBRWhDOzs7Ozs7R0FNRztBQUNILE1BQU0sVUFBVSxJQUFJLENBQUMsR0FBTyxFQUFFLEtBQVMsRUFBRSxPQUFXO0lBQ2xELE1BQU0sTUFBTSxHQUFTLEVBQUUsQ0FBQztJQUN4QixLQUFLLE1BQU0sR0FBRyxJQUFJLEtBQUssRUFBRTtRQUN2QixNQUFNLFlBQVksR0FBRyxDQUFDLENBQUMsUUFBUSxDQUM3QixFQUFFLEdBQUcsRUFBRSxRQUFRLEVBQUUsR0FBRyxFQUFFLEVBQ3RCLEtBQUssQ0FBQyxHQUFHLENBQUMsRUFDVixPQUFPLENBQ1IsQ0FBQztRQUNGLE1BQU0sQ0FBQyxJQUFJLENBQUMsSUFBSSxLQUFLLENBQUMsWUFBWSxDQUFDLENBQUMsQ0FBQztLQUN0QztJQUNELE9BQU8sSUFBSSxNQUFNLENBQUMsY0FBYyxDQUFDLE1BQU0sRUFBRSxFQUFFLGNBQWMsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDO0FBQ3JFLENBQUM7QUFZRDs7O0dBR0c7QUFDSCxNQUFNLE9BQU8sS0FBTSxTQUFRLE1BQU0sQ0FBQyxNQUFNO0lBY3RDOzs7Ozs7Ozs7O1FBVUk7SUFDSixZQUFZLE9BQW9CO1FBQzlCLEtBQUssRUFBRSxDQUFDO1FBRVIsSUFBSSxDQUFDLFlBQVksQ0FBQyxJQUFJLEVBQUUsT0FBTyxFQUFFO1lBQy9CLEdBQUcsRUFBRSxJQUFJO1lBQ1QsUUFBUSxFQUFFLElBQUk7WUFDZCxJ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