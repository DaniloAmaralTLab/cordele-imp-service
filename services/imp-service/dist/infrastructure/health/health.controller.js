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
Object.defineProperty(exports, "__esModule", { value: true });
exports.HealthController = void 0;
const openapi = require("@nestjs/swagger");
const common_1 = require("@nestjs/common");
const terminus_1 = require("@nestjs/terminus");
const swagger_1 = require("@nestjs/swagger");
const prisma_service_1 = require("../persistence/prisma.service");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
let HealthController = class HealthController {
    health;
    prismaIndicator;
    prisma;
    constructor(health, prismaIndicator, prisma) {
        this.health = health;
        this.prismaIndicator = prismaIndicator;
        this.prisma = prisma;
    }
    check() {
        return this.health.check([
            () => this.prismaIndicator.pingCheck('database', this.prisma),
        ]);
    }
    live() {
        return { status: 'ok' };
    }
};
exports.HealthController = HealthController;
__decorate([
    openapi.ApiOperation({ summary: "Readiness: the app plus every dependency it cannot serve traffic without." }),
    (0, common_1.Get)(),
    (0, jwt_auth_guard_1.Public)(),
    (0, terminus_1.HealthCheck)(),
    openapi.ApiResponse({ status: 200, type: Object }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], HealthController.prototype, "check", null);
__decorate([
    openapi.ApiOperation({ summary: "Liveness: process is up. Deliberately dependency-free." }),
    (0, common_1.Get)('live'),
    (0, jwt_auth_guard_1.Public)(),
    openapi.ApiResponse({ status: 200 }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Object)
], HealthController.prototype, "live", null);
exports.HealthController = HealthController = __decorate([
    (0, swagger_1.ApiTags)('ops'),
    (0, common_1.Controller)('health'),
    __metadata("design:paramtypes", [terminus_1.HealthCheckService,
        terminus_1.PrismaHealthIndicator,
        prisma_service_1.PrismaService])
], HealthController);
//# sourceMappingURL=health.controller.js.map