"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ImpModule = void 0;
const common_1 = require("@nestjs/common");
const persistence_module_1 = require("../../infrastructure/persistence/persistence.module");
const imp_domain_service_1 = require("../../domain/imp.domain-service");
const imp_repository_interface_1 = require("../../domain/imp.repository.interface");
const prisma_imp_repository_1 = require("../../infrastructure/persistence/prisma-imp.repository");
const imp_controller_1 = require("./imp.controller");
const imp_service_1 = require("./imp.service");
let ImpModule = class ImpModule {
};
exports.ImpModule = ImpModule;
exports.ImpModule = ImpModule = __decorate([
    (0, common_1.Module)({
        imports: [
            persistence_module_1.PersistenceModule,
        ],
        controllers: [imp_controller_1.ImpController],
        providers: [
            imp_service_1.ImpService,
            imp_domain_service_1.ImpDomainService,
            { provide: imp_repository_interface_1.ImpRepositoryPort, useClass: prisma_imp_repository_1.PrismaImpRepository },
        ],
        exports: [imp_service_1.ImpService],
    })
], ImpModule);
//# sourceMappingURL=imp.module.js.map