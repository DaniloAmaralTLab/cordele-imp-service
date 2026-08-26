import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { JwtAuthGuard } from './infrastructure/auth/jwt-auth.guard';
import { CorrelationIdInterceptor } from './infrastructure/http/correlation-id.interceptor';
import { ProblemDetailFilter } from './infrastructure/http/problem-detail.filter';
import { AuthModule } from './infrastructure/auth/auth.module';
import { EmpresaContextMiddleware } from './infrastructure/auth/empresa-context.middleware';
import { DatabaseModule } from './infrastructure/persistence/database.module';
import { PersistenceModule } from './infrastructure/persistence/persistence.module';
import { EventBusModule } from './infrastructure/events/event-bus.module';
import { HealthModule } from './infrastructure/health/health.module';
import { ProjStubModule } from './infrastructure/proj/proj-stub.module';
import { ImpModule } from './modules/imp/imp.module';

/**
 * Root composition module for cordele.
 *
 * Feature modules map one-to-one to bounded contexts; they must never import
 * each other's providers directly — cross-context communication goes through
 * published contracts (HTTP or the message broker).
 *
 * APP_GUARD registra dois guards globais (ordem é relevante):
 *   1. ThrottlerGuard — rate limiting
 *   2. JwtAuthGuard  — autenticação JWT Bearer + scope validation
 *
 * EmpresaContextMiddleware registrado para todas as rotas (`*`).
 * Popula `AsyncLocalStorage` com { userId, empresaId } antes dos guards,
 * decodificando o JWT Bearer sem verificação criptográfica (a verificação
 * acontece no JwtAuthGuard, que roda depois). RULE-07.
 *
 * Stubs PROJ (P2): CreateProjetoEditorialStub + AdvanceProjetoStatusStub providos pelo
 * ProjStubModule (@Global) até o PROJ service estar disponível (IMP-INT-001 + IMP-INT-002).
 * ProjStubModule exporta os tokens, tornando-os visíveis para ImpModule sem violar RULE-04.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: ['.env.local', '.env'],
    }),
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 120 }]),
    HealthModule,
    DatabaseModule,
    PersistenceModule,
    EventBusModule,
    ProjStubModule,
    AuthModule,
    ImpModule,
  ],
  providers: [
    // Global exception filter — RFC 7807 Problem Detail (domain + HTTP errors).
    // Registrado antes dos guards para cobrir toda a pilha.
    { provide: APP_FILTER, useClass: ProblemDetailFilter },
    // Global interceptors — applied to every HTTP response (order: first registered, first applied).
    { provide: APP_INTERCEPTOR, useClass: CorrelationIdInterceptor },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule implements NestModule {
  /**
   * Aplica `EmpresaContextMiddleware` para todas as rotas do processo.
   *
   * O middleware decodifica (sem verificar) o Bearer JWT para extrair
   * `empresa_id` e `sub`, populando `AsyncLocalStorage` antes de qualquer
   * guard ou handler executar. Rotas `@Public()` recebem next() sem contexto
   * e nunca atingem repositórios.
   */
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(EmpresaContextMiddleware).forRoutes('*');
  }
}
