import { SetMetadata } from '@nestjs/common';

import { UserRole } from '../entity/user.entity';

export const REQUIRED_ROUTE_KEY = 'required_route_key';
export const Role = (role: UserRole[]): MethodDecorator =>
    SetMetadata(REQUIRED_ROUTE_KEY, role);
