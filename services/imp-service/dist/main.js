"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const compression_1 = __importDefault(require("compression"));
const helmet_1 = __importDefault(require("helmet"));
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const core_1 = require("@nestjs/core");
const swagger_1 = require("@nestjs/swagger");
const app_module_1 = require("./app.module");
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule, { bufferLogs: true });
    const config = app.get(config_1.ConfigService);
    const logger = new common_1.Logger('Bootstrap');
    app.use((0, helmet_1.default)());
    app.use((0, compression_1.default)());
    const corsOrigins = (config.get('CORS_ORIGINS') ?? '*')
        .split(',')
        .map((origin) => origin.trim())
        .filter((origin) => origin.length > 0);
    app.enableCors({
        origin: corsOrigins.includes('*') ? true : corsOrigins,
        credentials: true,
        allowedHeaders: ['Authorization', 'Content-Type', 'X-Correlation-Id', 'X-Tenant-Id'],
    });
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: common_1.VersioningType.URI, defaultVersion: '1' });
    app.useGlobalPipes(new common_1.ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
    }));
    app.enableShutdownHooks();
    const swaggerConfig = new swagger_1.DocumentBuilder()
        .setTitle('Cordelê API')
        .setDescription('O Cordelê é uma plataforma SaaS B2B para transformar manuscritos, textos e arquivos Markdown em publicações digitais ePub válidas, sem necessidade de diagramação manual ou ferramentas técnicas especializadas.')
        .setVersion('1.0')
        .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'bearer')
        .addGlobalParameters({
        name: 'X-Tenant-Id',
        in: 'header',
        required: false,
        description: 'Overrides the empresa resolved from the access token.',
    })
        .build();
    const document = swagger_1.SwaggerModule.createDocument(app, swaggerConfig);
    swagger_1.SwaggerModule.setup('api/docs', app, document, {
        swaggerOptions: { persistAuthorization: true },
    });
    const port = Number(config.get('PORT') ?? 3000);
    await app.listen(port, '0.0.0.0');
    logger.log(`cordele listening on port ${port}`);
    logger.log(`OpenAPI available at http://localhost:${port}/api/docs`);
}
void bootstrap();
//# sourceMappingURL=main.js.map