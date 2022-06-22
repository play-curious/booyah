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
  props: { [prop: string]: TweenOptions },
  options: TweenOptions
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
  return new entity.ParallelEntity(tweens);
}

/**
 * Tween takes the following options:
 * @obj - an actual object, a function that returns an object, or null (in which case the value is internal only)
 * @property - a string property name, or null if no @obj is set
 * @from - defaults to current value
 * @to - required
 * @duration - Time in ms. Defaults to 1000
 * @easing - Function of t in [0, 1]. Defaults to easing.linear
 * @interpolate - Function to use for setting a new value.
 *  Depends on data type, such as color, vector, angle, ...
 **/
export class TweenOptions {
  obj?: { [k: string]: any };
  property?: string;
  from?: any;
  to: any;
  duration: number = 1000;
  easing: easing.EasingFunction = easing.linear;
  interpolate?: (...params: any) => any = interpolation.scalar;
  onSetup?: () => any;
  onUpdate?: (value: number) => any;
  onTeardown?: () => any;
}

// TODO: add onSetup

/**
 * Events:
 *  updatedValue(value)
 */
export class Tween extends entity.EntityBase {
  public readonly options: TweenOptions;

  private _currentObj: { [k: string]: any };
  private _startValue: any;
  private _value: any;
  private _startTime: number;

  constructor(options?: Partial<TweenOptions>) {
    super();

    this.options = util.fillInOptions(options, new TweenOptions());

    if (this.options.onUpdate) {
      this._on(this, "updatedValue", this.options.onUpdate);
    }
  }

  _setup() {
    this._currentObj = _.isFunction(this.options.obj)
      ? this.options.obj
      : this.options.obj;

    if (util.isNullish(this.options.from)) {
      this._startValue = this._getValue();
      this._value = this._startValue;
    } else {
      this._startValue = this.options.from;
      this._value = this._startValue;
      this._updateValue();
    }

    this._startTime = this._lastFrameInfo.timeSinceStart;

    if (this.options.onSetup) {
      this.options.onSetup();
    }
  }

  _update() {
    if (
      this._lastFrameInfo.timeSinceStart - this._startTime >=
      this.options.duration
    ) {
      this._transition = entity.makeTransition();

      // Snap to end
      this._value = this.options.to;
      this._updateValue();
    } else {
      const easedProgress = this.options.easing(
        (this._lastFrameInfo.timeSinceStart - this._startTime) /
          this.options.duration
      );
      this._value = this.options.interpolate(
        this._startValue,
        this.options.to,
        easedProgress
      );
      this._updateValue();
    }
  }

  _teardown() {
    if (this.options.onTeardown) {
      this.options.onTeardown();
    }
  }

  _getValue(): any {
    return this._currentObj[this.options.property];
  }

  _updateValue() {
    if (this._currentObj) this._currentObj[this.options.property] = this._value;

    this.emit("updatedValue", this._value);
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
