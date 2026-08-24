"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ImpEntity = exports.ImpStatus = void 0;
const openapi = require("@nestjs/swagger");
var ImpStatus;
(function (ImpStatus) {
    ImpStatus["ACTIVE"] = "ACTIVE";
    ImpStatus["INACTIVE"] = "INACTIVE";
    ImpStatus["ARCHIVED"] = "ARCHIVED";
})(ImpStatus || (exports.ImpStatus = ImpStatus = {}));
class ImpEntity {
    id;
    name;
    description;
    status;
    tenantId;
    createdAt;
    updatedAt;
    constructor(props) {
        ImpEntity.assertInvariants(props);
        this.id = props.id;
        this.name = props.name;
        this.description = props.description;
        this.status = props.status;
        this.tenantId = props.tenantId;
        this.createdAt = props.createdAt;
        this.updatedAt = props.updatedAt;
    }
    with(changes) {
        return new ImpEntity({
            id: this.id,
            name: changes.name ?? this.name,
            description: changes.description ?? this.description,
            status: changes.status ?? this.status,
            tenantId: this.tenantId,
            createdAt: this.createdAt,
            updatedAt: new Date(),
        });
    }
    isActive() {
        return this.status === ImpStatus.ACTIVE;
    }
    archive() {
        return this.with({ status: ImpStatus.ARCHIVED });
    }
    static assertInvariants(props) {
        if (!props.id) {
            throw new Error('ImpEntity: id is required');
        }
        if (!props.name || props.name.trim().length < 2) {
            throw new Error('ImpEntity: name must have at least 2 characters');
        }
        if (!props.tenantId) {
            throw new Error('ImpEntity: empresa is required');
        }
    }
    static _OPENAPI_METADATA_FACTORY() {
        return { id: { required: true, type: () => String }, name: { required: true, type: () => String }, description: { required: false, type: () => String }, status: { required: true, enum: require("./imp.entity").ImpStatus }, tenantId: { required: true, type: () => String, description: "Owning empresa; every query must be scoped by it." }, createdAt: { required: true, type: () => Date }, updatedAt: { required: true, type: () => Date } };
    }
}
exports.ImpEntity = ImpEntity;
//# sourceMappingURL=imp.entity.js.map