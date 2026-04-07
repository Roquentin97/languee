import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
type AuthUser = {
    userId: string;
    sessionId: string;
};
export declare class AuthController {
    private readonly authService;
    constructor(authService: AuthService);
    login(dto: LoginDto, req: Request, res: Response): Promise<{
        accessToken: string;
    }>;
    refresh(req: Request, res: Response): Promise<{
        accessToken: string;
    }>;
    logout(user: AuthUser, res: Response): Promise<{
        message: string;
    }>;
    logoutAll(user: AuthUser, res: Response): Promise<{
        message: string;
    }>;
    getSessions(user: AuthUser): Promise<object[]>;
}
export {};
