import Entity from './Entity';
/** An entity that returns the requested transition immediately  */
export default class TransitoryEntity extends Entity {
    transition: boolean;
    constructor(transition?: boolean);
    _setup(): void;
}
