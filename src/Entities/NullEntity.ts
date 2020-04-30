import Entity, {EntityConfig, TearDownOptions, UpdateOptions} from "./Entity";

/** Empty class just to indicate an entity that does nothing and never requests a transition  */
export default class NullEntity extends Entity {}