import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
export interface AuthenticatedUser {
    readonly userId: string;
    readonly username: string;
    readonly roles: string[];
    readonly scopes: string[];
    readonly tenantId: string;
}
export declare const IS_PUBLIC_KEY = "isPublic";
export declare const Public: () => MethodDecorator & ClassDecorator;
export declare const CurrentUser: (...dataOrPipes: unknown[]) => ParameterDecorator;
declare const JwtAuthGuard_base: import("@nestjs/passport").Type<import("@nestjs/passport").IAuthGuard>;
export declare class JwtAuthGuard extends JwtAuthGuard_base {
    private readonly reflector;
    constructor(reflector: Reflector);
    canActivate(context: ExecutionContext): Promise<boolean>;
    private resolveTenant;
}
export {};
