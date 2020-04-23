"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Entity_1 = require("./Entity");
const util = require("../utils");
const underscore_1 = require("underscore");
/**
 Allows a bunch of entities to execute in parallel.
 Updates child entities until they ask for a transition, at which point they are torn down.
 If autoTransition=true, requests a transition when all child entities have completed.
 */
class ParallelEntity extends Entity_1.default {
    /**
      @entities can be subclasses of entity.Entity or an object like { entity:, config: }
      @options:
        * autoTransition: Should the entity request a transition when all the child entities are done?  (defaults to false)
    */
    constructor(entities = [], options = {}) {
        super();
        this.entities = [];
        this.entityConfigs = [];
        this.entityIsActive = [];
        this.autoTransition = false;
        util.setupOptions(this, options, {
            autoTransition: false
        });
        for (const currentEntity of entities) {
            if (currentEntity instanceof Entity_1.default) {
                this.addEntity(currentEntity);
            }
            else {
                this.addEntity(currentEntity.entity, currentEntity.config);
            }
        }
    }
    setup(config) {
        super.setup(config);
        for (let i = 0; i < this.entities.length; i++) {
            const entity = this.entities[i];
            if (!entity.isSetup) {
                const entityConfig = ParallelEntity.processEntityConfig(this.config, this.entityConfigs[i]);
                entity.setup(entityConfig);
            }
            this.entityIsActive[i] = true;
        }
    }
    update(options) {
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
        if (this.autoTransition && !underscore_1.default.some(this.entityIsActive))
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
    onSignal(signal, data) {
        super.onSignal(signal, data);
        for (let i = 0; i < this.entities.length; i++) {
            if (this.entityIsActive[i])
                this.entities[i].onSignal(signal, data);
        }
    }
    // If config is provided, it will overload the config provided to this entity by setup()
    addEntity(entity, config = null) {
        this.entities.push(entity);
        this.entityConfigs.push(config);
        this.entityIsActive.push(true);
        // If we have already been setup, setup this new entity
        if (this.isSetup && !entity.isSetup) {
            const entityConfig = ParallelEntity.processEntityConfig(this.config, config);
            entity.setup(entityConfig);
        }
    }
    removeEntity(entity) {
        const index = this.entities.indexOf(entity);
        if (index === -1)
            throw new Error("Cannot find entity to remove");
        if (entity.isSetup) {
            entity.teardown();
        }
        this.entities.splice(index, 1);
        this.entityConfigs.splice(index, 1);
        this.entityIsActive.splice(index, 1);
    }
    removeAllEntities() {
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
exports.ParallelEntity = ParallelEntity;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiUGFyYWxsZWxFbnRpdHkuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvRW50aXRpZXMvUGFyYWxsZWxFbnRpdHkudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFBQSxxQ0FBK0U7QUFDL0UsaUNBQWlDO0FBQ2pDLDJDQUEyQjtBQU0zQjs7OztHQUlHO0FBQ0gsTUFBYSxjQUFlLFNBQVEsZ0JBQU07SUFLdEM7Ozs7TUFJRTtJQUNGLFlBQVksV0FBOEIsRUFBRSxFQUFFLFVBQWdDLEVBQUU7UUFDNUUsS0FBSyxFQUFFLENBQUM7UUFWTCxhQUFRLEdBQVksRUFBRSxDQUFDO1FBQ3ZCLGtCQUFhLEdBQWtCLEVBQUUsQ0FBQztRQUNsQyxtQkFBYyxHQUFhLEVBQUUsQ0FBQztRQUM5QixtQkFBYyxHQUFXLEtBQUssQ0FBQTtRQVNqQyxJQUFJLENBQUMsWUFBWSxDQUFDLElBQUksRUFBRSxPQUFPLEVBQUU7WUFDN0IsY0FBYyxFQUFFLEtBQUs7U0FDeEIsQ0FBQyxDQUFDO1FBRUgsS0FBSyxNQUFNLGFBQWEsSUFBSSxRQUFRLEVBQUU7WUFDbEMsSUFBSSxhQUFhLFlBQVksZ0JBQU0sRUFBRTtnQkFDakMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxhQUFhLENBQUMsQ0FBQzthQUNqQztpQkFBTTtnQkFDSCxJQUFJLENBQUMsU0FBUyxDQUFDLGFBQWEsQ0FBQyxNQUFNLEVBQUUsYUFBYSxDQUFDLE1BQU0sQ0FBQyxDQUFDO2FBQzlEO1NBQ0o7SUFDTCxDQUFDO0lBRUQsS0FBSyxDQUFDLE1BQW1CO1FBQ3JCLEtBQUssQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLENBQUM7UUFFcEIsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSxFQUFFO1lBQzNDLE1BQU0sTUFBTSxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDaEMs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