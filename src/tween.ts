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
export function make(
  obj: any,
  props: any,
  options: any
): entity.ParallelEntity {
  const tweens: any[] = [];
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

export interface TweenOptions {
  obj?: any;
  property?: string;
  from?: any;
  to: any;
  duration?: number;
  easing?: (t: number) => number;
  interpolate?: any;
}

/**
 * Events:
 *  updatedValue(value)
 */
export class Tween extends entity.Entity implements TweenOptions {
  currentObj: any;
  interpolate: any;
  property: string;
  from: any;
  obj: any;
  to: any;
  startValue: any;
  value: any;
  startTime: number;
  duration: number;
  easing: (t: number) => number;

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
  constructor(options: TweenOptions) {
    super();

    util.setupOptions(this, options, {
      obj: null,
      property: null,
      from: null,
      to: util.REQUIRED_OPTION,
      duration: 1000,
      easing: easing.linear,
      interpolate: interpolation.scalar,
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

  _update(frameInfo: entity.FrameInfo) {
    if (this.startTime === null) this.startTime = frameInfo.timeSinceStart;

    if (frameInfo.timeSinceStart - this.startTime >= this.duration) {
      this.transition = entity.makeTransition();

      // Snap to end
      this.value = this.to;
      this._updateValue();
    } else {
      const easedProgress = this.easing(
        (frameInfo.timeSinceStart - this.startTime) / this.duration
      );
      this.value = this.interpolate(this.startValue, this.to, easedProgress);
      this._updateValue();
    }
  }

  _getValue() {
    return this.currentObj[this.property];
  }

  _updateValue() {
    if (this.currentObj) this.currentObj[this.property] = this.value;

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
  array: geom.lerpArray,
};
