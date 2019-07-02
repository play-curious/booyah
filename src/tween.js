import * as util from "./util.js";
import * as geom from "./geom.js";
import * as entity from "./entity.js";
import * as easing from "./easing.js";

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
    const tweenOptions = _.defaults(
      { obj, property: key },
      props[key],
      options
    );
    tweens.push(new Tween(tweenOptions));
  }
  return new entity.ParallelEntity(tweens, { autoTransition: true });
}

export class Tween extends entity.Entity {
  /**
   * Takes the following options:
   * @obj - an actual object, or a function that returns an object
   * @property
   * @from - defaults to current value
   * @to - required
   * @duration - Time in ms. Defaults to 1000
   * @easing - Function of t in [0, 1]. Defaults to easing.linear
   * @interpolation - Function to use for setting a new value.
   *  Depends on data type, such as color, vector, angle, ...
   **/
  constructor(options) {
    super();

    util.setupOptions(this, options, {
      obj: util.REQUIRED_OPTION,
      property: util.REQUIRED_OPTION,
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
    } else {
      this.startValue = this._getValue();
      this.value = this.startValue;
    }

    this.startTime = null;
  }

  _update(options) {
    if (this.startTime === null) this.startTime = options.timeSinceStart;

    if (options.timeSinceStart - this.startTime >= this.duration) {
      this.requestedTransition = true;

      // Snap to end
      this.value = this.to;
      this._updateValue();
    } else {
      const easedProgress = this.easing(
        (options.timeSinceStart - this.startTime) / this.duration
      );
      this.value = this.interpolate(this.startValue, this.to, easedProgress);
      this._updateValue();
    }
  }

  _getValue() {
    return this.currentObj[this.property];
  }

  _updateValue() {
    this.currentObj[this.property] = this.value;
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
