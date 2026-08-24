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
Object.defineProperty(exports, "__esModule", { value: true });
exports.ImpController = void 0;
const openapi = require("@nestjs/swagger");
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const jwt_auth_guard_1 = require("../../infrastructure/auth/jwt-auth.guard");
const create_imp_dto_1 = require("./dto/create-imp.dto");
const update_imp_dto_1 = require("./dto/update-imp.dto");
const imp_service_1 = require("./imp.service");
let ImpController = class ImpController {
    impService;
    constructor(impService) {
        this.impService = impService;
    }
    create(dto, user) {
        return this.impService.create(dto, user);
    }
    findAll(user, page = 1, size = 20) {
        return this.impService.findAll(user, { page: Number(page), size: Number(size) });
    }
    findOne(id, user) {
        return this.impService.findOne(id, user);
    }
    update(id, dto, user) {
        return this.impService.update(id, dto, user);
    }
    remove(id, user) {
        return this.impService.remove(id, user);
    }
};
exports.ImpController = ImpController;
__decorate([
    (0, common_1.Post)(),
    (0, swagger_1.ApiOperation)({ summary: 'Create a new imp record' }),
    (0, swagger_1.ApiCreatedResponse)({ description: 'The imp record was created.' }),
    openapi.ApiResponse({ status: 201, type: require("../../domain/imp.entity").ImpEntity }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, jwt_auth_guard_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_imp_dto_1.CreateImpDto, Object]),
    __metadata("design:returntype", Promise)
], ImpController.prototype, "create", null);
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'List imp records' }),
    (0, swagger_1.ApiOkResponse)({ description: 'Paginated imp records.' }),
    openapi.ApiResponse({ status: 200 }),
    __param(0, (0, jwt_auth_guard_1.CurrentUser)()),
    __param(1, (0, common_1.Query)('page')),
    __param(2, (0, common_1.Query)('size')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", Promise)
], ImpController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, swagger_1.ApiOperation)({ summary: 'Get a single imp record by id' }),
    (0, swagger_1.ApiOkResponse)({ description: 'The requested imp record.' }),
    openapi.ApiResponse({ status: 200, type: require("../../domain/imp.entity").ImpEntity }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, jwt_auth_guard_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], ImpController.prototype, "findOne", null);
__decorate([
    (0, common_1.Patch)(':id'),
    (0, swagger_1.ApiOperation)({ summary: 'Partially update a imp record' }),
    (0, swagger_1.ApiOkResponse)({ description: 'The updated imp record.' }),
    openapi.ApiResponse({ status: 200, type: require("../../domain/imp.entity").ImpEntity }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, jwt_auth_guard_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, update_imp_dto_1.UpdateImpDto, Object]),
    __metadata("design:returntype", Promise)
], ImpController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, common_1.HttpCode)(common_1.HttpStatus.NO_CONTENT),
    (0, swagger_1.ApiOperation)({ summary: 'Delete a imp record' }),
    (0, swagger_1.ApiNoContentResponse)({ description: 'The imp record was deleted.' }),
    openapi.ApiResponse({ status: common_1.HttpStatus.NO_CONTENT }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, jwt_auth_guard_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], ImpController.prototype, "remove", null);
exports.ImpController = ImpController = __decorate([
    (0, swagger_1.ApiTags)('imp'),
    (0, swagger_1.ApiBearerAuth)('bearer'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.Controller)({ path: 'imp', version: '1' }),
    __metadata("design:paramtypes", [imp_service_1.ImpService])
], ImpController);
//# sourceMappingURL=imp.controller.js.map