import * as geom from "./geom";
import * as entity from "./entity";
/**
 * Creates a ParallelEntity that carries out multiple tweens on the same object.
 * Usage: tween.make(filter, { brightness: { to: 5 } }, { duration: 2000 })
 * @obj Object on which to carry out the tween
 * @props Map of property names to options for that property (like Tween() would take)
 * @options Default options for all properties, if not overridden by @props
 */
export declare function make(obj: any, props: any, options: any): entity.ParallelEntity;
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
export declare class Tween extends entity.Entity implements TweenOptions {
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
    constructor(options: TweenOptions);
    _setup(): void;
    _update(options: entity.Options): void;
    _getValue(): any;
    _updateValue(): void;
}
/**
 * Interpolation functions with a signature of (fromValue, toValue, easedProgress)
 */
export declare const interpolation: {
    scalar: typeof geom.lerp;
    color: typeof geom.lerpColor;
    point: typeof geom.lerpPoint;
    angle: typeof geom.lerpAngle;
    array: typeof geom.lerpArray;
};
