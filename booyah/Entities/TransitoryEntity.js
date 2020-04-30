"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Entity_1 = require("./Entity");
/** An entity that returns the requested transition immediately  */
class TransitoryEntity extends Entity_1.default {
    constructor(transition = true) {
        super();
        this.transition = transition;
    }
    _setup() {
        this.requestedTransition = this.transition;
    }
}
exports.default = TransitoryEntity;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiVHJhbnNpdG9yeUVudGl0eS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9FbnRpdGllcy9UcmFuc2l0b3J5RW50aXR5LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBQUEscUNBQTZCO0FBRTdCLG1FQUFtRTtBQUNuRSxNQUFxQixnQkFBaUIsU0FBUSxnQkFBTTtJQUVoRCxZQUFtQixhQUFhLElBQUk7UUFDaEMsS0FBSyxFQUFFLENBQUM7UUFETyxlQUFVLEdBQVYsVUFBVSxDQUFPO0lBRXBDLENBQUM7SUFFRCxNQUFNO1FBQ0YsSUFBSSxDQUFDLG1CQUFtQixHQUFHLElBQUksQ0FBQyxVQUFVLENBQUM7SUFDL0MsQ0FBQztDQUNKO0FBVEQsbUNBU0MifQ==