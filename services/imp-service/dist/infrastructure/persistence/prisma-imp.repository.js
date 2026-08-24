"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var PrismaImpRepository_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PrismaImpRepository = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("./prisma.service");
const imp_mapper_1 = require("./imp.mapper");
let PrismaImpRepository = PrismaImpRepository_1 = class PrismaImpRepository {
    prisma;
    logger = new common_1.Logger(PrismaImpRepository_1.name);
    constructor(prisma) {
        this.prisma = prisma;
    }
    async save(entity, tenantId) {
        if (entity.tenantId !== tenantId) {
            throw new Error('IMP: cross-empresa write rejected');
        }
        const model = await this.prisma.imp.upsert({
            where: { id: entity.id },
            create: imp_mapper_1.ImpMapper.toCreateInput(entity),
            update: imp_mapper_1.ImpMapper.toUpdateInput(entity),
        });
        return imp_mapper_1.ImpMapper.toDomain(model);
    }
    async findById(id, tenantId) {
        const model = await this.prisma.imp.findFirst({
            where: { id, tenantId },
        });
        return model ? imp_mapper_1.ImpMapper.toDomain(model) : null;
    }
    async findAll(page, tenantId) {
        const size = Math.min(Math.max(page.size, 1), 200);
        const skip = Math.max(page.page - 1, 0) * size;
        const where = { tenantId };
        const [models, total] = await this.prisma.$transaction([
            this.prisma.imp.findMany({
                where,
                skip,
                take: size,
                orderBy: { createdAt: 'desc' },
            }),
            this.prisma.imp.count({ where }),
        ]);
        return { items: imp_mapper_1.ImpMapper.toDomainList(models), total };
    }
    async deleteById(id, tenantId) {
        await this.prisma.imp.deleteMany({
            where: { id, tenantId },
        });
        this.logger.debug(`IMP row deleted: ${id}`);
    }
};
exports.PrismaImpRepository = PrismaImpRepository;
exports.PrismaImpRepository = PrismaImpRepository = PrismaImpRepository_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], PrismaImpRepository);
//# sourceMappingURL=prisma-imp.repository.js.map