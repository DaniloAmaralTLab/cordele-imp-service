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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var ImpService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ImpService = void 0;
const common_1 = require("@nestjs/common");
const imp_domain_service_1 = require("../../domain/imp.domain-service");
const imp_repository_interface_1 = require("../../domain/imp.repository.interface");
let ImpService = ImpService_1 = class ImpService {
    repository;
    domainService;
    logger = new common_1.Logger(ImpService_1.name);
    constructor(repository, domainService) {
        this.repository = repository;
        this.domainService = domainService;
    }
    async create(dto, user) {
        const entity = this.domainService.createFrom({
            name: dto.name,
            description: dto.description,
            status: dto.status,
            tenantId: user.tenantId,
        });
        const saved = await this.repository.save(entity, user.tenantId);
        this.logger.log(`IMP created: ${saved.id}`);
        return saved;
    }
    async findAll(user, page) {
        return this.repository.findAll(page, user.tenantId);
    }
    async findOne(id, user) {
        const found = await this.repository.findById(id, user.tenantId);
        if (!found) {
            throw new common_1.NotFoundException(`IMP ${id} not found`);
        }
        return found;
    }
    async update(id, dto, user) {
        const current = await this.findOne(id, user);
        const next = this.domainService.applyChanges(current, dto);
        const saved = await this.repository.save(next, user.tenantId);
        return saved;
    }
    async remove(id, user) {
        await this.findOne(id, user);
        await this.repository.deleteById(id, user.tenantId);
        this.logger.log(`IMP deleted: ${id}`);
    }
};
exports.ImpService = ImpService;
exports.ImpService = ImpService = ImpService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(imp_repository_interface_1.ImpRepositoryPort)),
    __metadata("design:paramtypes", [Object, imp_domain_service_1.ImpDomainService])
], ImpService);
//# sourceMappingURL=imp.service.js.map