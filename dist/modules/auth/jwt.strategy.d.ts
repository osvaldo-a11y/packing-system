import { Strategy } from 'passport-jwt';
import type { AppRole } from '../../common/roles';
export type JwtUserPayload = {
    sub: string;
    username: string;
    role: AppRole;
};
declare const JwtStrategy_base: new (...args: any[]) => Strategy;
export declare class JwtStrategy extends JwtStrategy_base {
    constructor();
    validate(payload: JwtUserPayload): {
        userId: string;
        username: string;
        role: AppRole;
    };
}
export {};
