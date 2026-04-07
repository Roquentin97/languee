import { Strategy } from 'passport-jwt';
interface JwtPayload {
    sub: string;
    session_id: string;
}
declare const JwtStrategy_base: new (...args: [opt: import("passport-jwt").StrategyOptionsWithRequest] | [opt: import("passport-jwt").StrategyOptionsWithoutRequest]) => Strategy & {
    validate(...args: any[]): unknown;
};
export declare class JwtStrategy extends JwtStrategy_base {
    constructor();
    validate(payload: JwtPayload): {
        userId: string;
        sessionId: string;
    };
}
export {};
