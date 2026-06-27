export interface ApigeePort {
    getToken(): Promise<string>;
}

export interface ApigeeTokenDto {
    access_token: string;
    token_type: string;
    expires_in: number;
    scope: string;
}
