import { IncomingRequest } from '@nestjs/microservices';

import { UNKNOWN_EVENT_PATTERN } from '@/shared/application/const/message-broker-unknown-event-pattern.const';

export class CustomDeserialize implements IncomingRequest {
    pattern: any;
    data: any;
    id: string;
    validatePattern: string[];

    constructor(
        private toValidatePattern: string[],
        private queue: string,
    ) {
        this.setValidatePattern(this.toValidatePattern);
    }

    setValidatePattern(validatePattern: string[]): void {
        this.validatePattern = validatePattern;
    }

    getValidatePattern(): string[] {
        return this.validatePattern;
    }

    deserialize(data: any): any {
        const patternFound = this.validateKnownPatterns(data, [
            ...this.getValidatePattern(),
        ]);
        return { ...data, pattern: patternFound };
    }

    validateKnownPatterns = (data: any, pattern: string[]): string => {
        const patternFound = pattern.find((value) => {
            return value === data.pattern;
        });
        return patternFound
            ? `${this.queue}.${patternFound}`
            : UNKNOWN_EVENT_PATTERN;
    };
}
