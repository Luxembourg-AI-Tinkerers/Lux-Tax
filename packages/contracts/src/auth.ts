export interface UserDto {
  readonly id: string;
  readonly email: string;
  readonly firstName?: string;
  readonly lastName?: string;
  readonly isEmailVerified: boolean;
  readonly createdAt: string;
}

export interface AuthTokensDto {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiresIn: number;
}

export interface AuthResponseDto {
  readonly user: UserDto;
  readonly tokens: AuthTokensDto;
}

export interface RegisterRequestDto {
  readonly email: string;
  readonly password: string;
  readonly firstName?: string;
  readonly lastName?: string;
}

export interface LoginRequestDto {
  readonly email: string;
  readonly password: string;
}

export interface RefreshTokenRequestDto {
  readonly refreshToken: string;
}
