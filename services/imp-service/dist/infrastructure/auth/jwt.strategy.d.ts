import { ConfigService } from '@nestjs/config';
import { Strategy } from 'passport-jwt';
import type { AuthenticatedUser } from './jwt-auth.guard';
interface JwtPayload {
    sub: string;
    preferred_username?: string;
    email?: string;
    scope?: string;
    realm_access?: {
        roles?: string[];
    };
    tenant_id?: string;
}
declare const JwtStrategy_base: new (...args: any[]) => Strategy;
export declare class JwtStrategy extends JwtStrategy_base {
    constructor(config: ConfigService);
    validate(payload: JwtPayload): AuthenticatedUser;
}
export {};
