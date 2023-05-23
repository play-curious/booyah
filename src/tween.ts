/* eslint-disable @typescript-eslint/no-explicit-any */

import * as util from "./util";
import * as geom from "./geom";
import * as chip from "./chip";
import * as easing from "./easing";
import * as _ from "underscore";

/**
 * Creates a Parallel that carries out multiple tweens on the same object.
 * Usage: tween.make(filter, { brightness: { to: 5 } }, { duration: 2000 })
 * @obj Object on which to carry out the tween
 * @props Map of property names to options for that property (like Tween() would take)
 * @options Default options for all properties, if not overridden by @props
 */
export function make(
  obj: any,
  props: { [prop: string]: Partial<TweenOptions<any, any>> },
  options: TweenOptions<any, any>
): chip.Parallel {
  const tweens: any[] = [];
  for (const key in props) {
    const tweenOptions = _.defaults(
      { obj, property: key },
      props[key],
      options
    );
    tweens.push(new Tween(tweenOptions));
  }
  return new chip.Parallel(tweens);
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
export class TweenOptions<Value, Obj extends object = undefined> {
  obj?: Obj;
  property?: keyof Obj;
  from?: Value;
  to: Value;
  duration = 1000;
  easing: easing.EasingFunction = easing.linear;
  interpolate: (from: Value, to: Value, easeProgress: number) => Value;
  onSetup?: () => unknown;
  onUpdate?: (value: Value) => unknown;
  onTeardown?: () => unknown;
}

// TODO: add onSetup

/**
 * Events:
 *  updatedValue(value)
 */
export class Tween<Value, Obj extends object> extends chip.ChipBase {
  public readonly options: TweenOptions<Value, Obj>;

  private _currentObj: Obj;
  private _startValue: Value;
  private _value: Value;
  private _timePassed: number;

  constructor(options?: Partial<TweenOptions<Value, Obj>>) {
    super();

    this.options = util.fillInOptions(options, new TweenOptions());

    if (!this.options.interpolate) {
      // @ts-ignore
      this.options.interpolate = interpolation.scalar;
    }

    if (this.options.onUpdate) {
      this._subscribe(this, "updatedValue", this.options.onUpdate);
    }
  }

  _onActivate() {
    this._currentObj = _.isFunction(this.options.obj)
      ? this.options.obj()
      : this.options.obj;

    if (util.isNullish(this.options.from)) {
      this._startValue = this._getValue();
      this._value = this._startValue;
    } else {
      this._startValue = this.options.from;
      this._value = this._startValue;
      this._updateValue();
    }

    this._timePassed = 0;

    if (this.options.onSetup) {
      this.options.onSetup();
    }
  }

  _onTick() {
    if (this._timePassed >= this.options.duration) {
      this._outputSignal = chip.makeSignal();

      // Snap to end
      this._value = this.options.to;
      this._updateValue();
    } else {
      this._timePassed += this._lastTickInfo.timeSinceLastTick;
      const easedProgress = this.options.easing(
        this._timePassed / this.options.duration
      );
      this._value = this.options.interpolate(
        this._startValue,
        this.options.to,
        easedProgress
      );
      this._updateValue();
    }
  }

  _onTerminate() {
    if (this.options.onTeardown) {
      this.options.onTeardown();
    }
  }

  _getValue(): any {
    return this._currentObj[this.options.property];
  }

  _updateValue() {
    // @ts-ignore
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
  angle: geom.lerpAngle,
  array: geom.lerpArray,
};
