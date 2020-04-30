import Entity from './Entity'

/** An entity that returns the requested transition immediately  */
export default class TransitoryEntity extends Entity {

    constructor(public transition = true) {
        super();
    }

    _setup() {
        this.requestedTransition = this.transition;
    }
}