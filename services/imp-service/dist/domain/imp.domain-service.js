"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ImpDomainService = void 0;
const node_crypto_1 = require("node:crypto");
const common_1 = require("@nestjs/common");
const imp_entity_1 = require("./imp.entity");
let ImpDomainService = class ImpDomainService {
    createFrom(command) {
        const now = new Date();
        return new imp_entity_1.ImpEntity({
            id: (0, node_crypto_1.randomUUID)(),
            name: command.name.trim(),
            description: command.description?.trim(),
            status: command.status ?? imp_entity_1.ImpStatus.ACTIVE,
            tenantId: command.tenantId,
            createdAt: now,
            updatedAt: now,
        });
    }
    applyChanges(current, command) {
        if (command.status && !this.canTransition(current.status, command.status)) {
            throw new Error(`ImpDomainService: illegal transition ${current.status} -> ${command.status}`);
        }
        return current.with({
            name: command.name?.trim(),
            description: command.description?.trim(),
            status: command.status,
        });
    }
    canTransition(from, to) {
        if (from === to) {
            return true;
        }
        return from !== imp_entity_1.ImpStatus.ARCHIVED;
    }
};
exports.ImpDomainService = ImpDomainService;
exports.ImpDomainService = ImpDomainService = __decorate([
    (0, common_1.Injectable)()
], ImpDomainService);
//# sourceMappingURL=imp.domain-service.js.map