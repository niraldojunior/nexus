import { MESSAGE_BROKER_DLQ_DEFAULT_PREFIX } from '@/shared/application/const/message-broker-dlq-default.const';
import { getDlqWithDefaults } from '@/shared/util/message-broker-get-dlq-queue-default-ending.util';

describe('getDlqWithDefaults', () => {
    it('should place default prefix', () => {
        const queue = 'myQueue';
        const expected = `${MESSAGE_BROKER_DLQ_DEFAULT_PREFIX}myQueue`;
        expect(getDlqWithDefaults(queue)).toBe(expected);
    });

    it('should handle queue names that starts with Q_', () => {
        const queue = `Q_myQueue`;
        const expected = `${MESSAGE_BROKER_DLQ_DEFAULT_PREFIX}myQueue`;
        expect(getDlqWithDefaults(queue)).toBe(expected);
    });
});
