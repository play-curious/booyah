import Entity, { EntityConfig, EntityResolvable, UpdateOptions } from "./Entity";
export interface ParallelEntityOptions {
    autoTransition?: boolean;
}
/**
 Allows a bunch of entities to execute in parallel.
 Updates child entities until they ask for a transition, at which point they are torn down.
 If autoTransition=true, requests a transition when all child entities have completed.
 */
export declare class ParallelEntity extends Entity {
    entities: Entity[];
    entityConfigs: EntityConfig[];
    entityIsActive: boolean[];
    autoTransition: boolean;
    /**
      @entities can be subclasses of entity.Entity or an object like { entity:, config: }
      @options:
        * autoTransition: Should the entity request a transition when all the child entities are done?  (defaults to false)
    */
    constructor(entities?: EntityResolvable[], options?: ParallelEntityOptions);
    setup(config: EntityConfig): void;
    update(options: UpdateOptions): void;
    teardown(): void;
    onSignal(signal: string, data: any): void;
    addEntity(entity: Entity, config?: EntityConfig): void;
    removeEntity(entity: Entity): void;
    removeAllEntities(): void;
}
