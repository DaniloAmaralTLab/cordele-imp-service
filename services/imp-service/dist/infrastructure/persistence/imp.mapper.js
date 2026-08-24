"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ImpMapper = void 0;
const imp_entity_1 = require("../../domain/imp.entity");
class ImpMapper {
    static toDomain(model) {
        return new imp_entity_1.ImpEntity({
            id: model.id,
            name: model.name,
            description: model.description ?? undefined,
            status: model.status,
            tenantId: model.tenantId,
            createdAt: model.createdAt,
            updatedAt: model.updatedAt,
        });
    }
    static toDomainList(models) {
        return models.map((model) => ImpMapper.toDomain(model));
    }
    static toCreateInput(entity) {
        return {
            id: entity.id,
            name: entity.name,
            description: entity.description ?? null,
            status: entity.status,
            tenantId: entity.tenantId,
            createdAt: entity.createdAt,
            updatedAt: entity.updatedAt,
        };
    }
    static toUpdateInput(entity) {
        return {
            name: entity.name,
            description: entity.description ?? null,
            status: entity.status,
            updatedAt: entity.updatedAt,
        };
    }
}
exports.ImpMapper = ImpMapper;
//# sourceMappingURL=imp.mapper.js.map