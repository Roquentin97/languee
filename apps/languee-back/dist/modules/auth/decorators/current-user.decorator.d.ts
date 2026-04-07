export interface CurrentUserPayload {
    userId: string;
    sessionId: string;
}
export declare const CurrentUser: (...dataOrPipes: unknown[]) => ParameterDecorator;
