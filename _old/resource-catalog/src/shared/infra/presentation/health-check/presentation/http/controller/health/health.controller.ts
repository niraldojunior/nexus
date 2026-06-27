import { Controller, Get } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import {
    HealthCheck,
    HealthCheckResult,
    HealthCheckService,
} from '@nestjs/terminus';

@Controller({ path: 'health' })
export class HealthController {
    constructor(private healthCheckService: HealthCheckService) {}

    @ApiOperation({ summary: 'Health Check' })
    @Get()
    @HealthCheck()
    async healthCheck(): Promise<HealthCheckResult> {
        return await this.healthCheckService.check([]);
    }
}
