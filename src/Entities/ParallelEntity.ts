import Entity, {EntityConfig, EntityResolvable, UpdateOptions} from "./Entity";
import * as util from "../utils";
import _ from "underscore";

export interface ParallelEntityOptions {
    autoTransition?: boolean
}

/**
 Allows a bunch of entities to execute in parallel.
 Updates child entities until they ask for a transition, at which point they are torn down.
 If autoTransition=true, requests a transition when all child entities have completed.
 */
export class ParallelEntity extends Entity {
    public entities:Entity[] = [];
    public entityConfigs:EntityConfig[] = [];
    public entityIsActive:boolean[] = [];
    public autoTransition:boolean = false
    /**
      @entities can be subclasses of entity.Entity or an object like { entity:, config: }
      @options:
        * autoTransition: Should the entity request a transition when all the child entities are done?  (defaults to false)
    */
    constructor(entities:EntityResolvable[] = [], options:ParallelEntityOptions = {}) {
        super();

        util.setupOptions(this, options, {
            autoTransition: false
        });

        for (const currentEntity of entities) {
            if (currentEntity instanceof Entity) {
                this.addEntity(currentEntity);
            } else {
                this.addEntity(currentEntity.entity, currentEntity.config);
            }
        }
    }

    setup(config:EntityConfig) {
        super.setup(config);

        for (let i = 0; i < this.entities.length; i++) {
            const entity = this.entities[i];
            if (!entity.isSetup) {
                const entityConfig = ParallelEntity.processEntityConfig(
                    this.config,
                    this.entityConfigs[i]
                );
                entity.setup(entityConfig);
            }

            this.entityIsActive[i] = true;
        }
    }

    update(options:UpdateOptions) {
        super.update(options);

        for (let i = 0; i < this.entities.length; i++) {
            if (this.entityIsActive[i]) {
                const entity = this.entities[i];

                entity.update(options);

                if (entity.requestedTransition) {
                    entity.teardown();

                    this.entityIsActive[i] = false;
                }
            }
        }

        if (this.autoTransition && !_.some(this.entityIsActive))
            this.requestedTransition = true;
    }

    teardown() {
        for (let i = 0; i < this.entities.length; i++) {
            if (this.entityIsActive[i]) {
                this.entities[i].teardown();
                this.entityIsActive[i] = false;
            }
        }

        super.teardown();
    }

    onSignal(signal:string, data:any) {
        super.onSignal(signal, data);

        for (let i = 0; i < this.entities.length; i++) {
            if (this.entityIsActive[i]) this.entities[i].onSignal(signal, data);
        }
    }

    // If config is provided, it will overload the config provided to this entity by setup()
    addEntity(entity:Entity, config:EntityConfig = null) {
        this.entities.push(entity);
        this.entityConfigs.push(config);
        this.entityIsActive.push(true);

        // If we have already been setup, setup this new entity
        if (this.isSetup && !entity.isSetup) {
            const entityConfig = ParallelEntity.processEntityConfig(this.config, config);
            entity.setup(entityConfig);
        }
    }

    removeEntity(entity:Entity): void {
        const index = this.entities.indexOf(entity);
        if (index === -1) throw new Error("Cannot find entity to remove");

        if (entity.isSetup) {
            entity.teardown();
        }

        this.entities.splice(index, 1);
        this.entityConfigs.splice(index, 1);
        this.entityIsActive.splice(index, 1);
    }

    removeAllEntities(): void {
        for (const entity of this.entities) {
            if (entity.isSetup) {
                entity.teardown();
            }

            this.entities = [];
            this.entityConfigs = [];
            this.entityIsActive = [];
        }
    }
}