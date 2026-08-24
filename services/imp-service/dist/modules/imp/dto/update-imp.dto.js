"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UpdateImpDto = void 0;
const openapi = require("@nestjs/swagger");
const swagger_1 = require("@nestjs/swagger");
const create_imp_dto_1 = require("./create-imp.dto");
class UpdateImpDto extends (0, swagger_1.PartialType)(create_imp_dto_1.CreateImpDto) {
    static _OPENAPI_METADATA_FACTORY() {
        return {};
    }
}
exports.UpdateImpDto = UpdateImpDto;
//# sourceMappingURL=update-imp.dto.js.map