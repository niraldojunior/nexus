import { LogResetContext } from '@/shared/application/decorator/log-reset-context.decorator';

const cls = { set: jest.fn() };
const ContextMethod = {
    testMethod: { service: 'TestService', operation: 'testOp' },
};

jest.mock('nestjs-cls', () => ({
    ClsServiceManager: {
        getClsService: jest.fn(() => cls),
    },
    CLS_ID: 'CLS_ID',
}));
jest.mock('@/shared/infra/config/env/environment-config.service', () => ({
    env: jest.fn(() => 'PREFIX'),
}));
jest.mock('@/shared/application/entity/snowflake-id.entity', () => ({
    Snowflake: { nextId: jest.fn(() => 12345) },
}));

describe('LogResetContext', () => {
    let logger: any;
    let target: any;
    let originalMethod: jest.Mock;

    beforeEach(() => {
        logger = { info: jest.fn() };
        originalMethod = jest.fn().mockResolvedValue('result');
        target = { logger, constructor: { name: 'TestClass' } };
        cls.set.mockClear();
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it('should log info and set CLS context with ContextMethod mapping', async () => {
        const descriptor = { value: originalMethod };
        global.ContextMethod = ContextMethod;
        LogResetContext()(target, 'testMethod', descriptor);
        await descriptor.value.call(target, 1, 2);
        expect(logger.info).toHaveBeenCalledWith(
            expect.objectContaining({
                description: expect.stringContaining('Finalização'),
            }),
            expect.stringContaining('testMethod'),
        );
        expect(cls.set).toHaveBeenCalledWith('CLS_ID', '12345');
        expect(logger.info).toHaveBeenCalledWith(
            expect.objectContaining({
                description: expect.stringContaining('Inicialização'),
            }),
            expect.stringContaining('testMethod'),
        );
        expect(originalMethod).toHaveBeenCalledWith(1, 2);
    });

    it('should use fallback mapping if ContextMethod is missing', async () => {
        const descriptor = { value: originalMethod };
        LogResetContext()(target, 'otherMethod', descriptor);
        await descriptor.value.call(target);
        expect(cls.set).toHaveBeenCalledWith(
            'service',
            'PREFIX.TestClass.otherMethod',
        );
        expect(cls.set).toHaveBeenCalledWith('operation', 'otherMethod');
    });

    it('should handle errors in decorator logic gracefully', async () => {
        const descriptor = { value: originalMethod };
        target.logger = null; // will cause error
        const spy = jest.spyOn(console, 'error').mockImplementation(() => null);
        LogResetContext()(target, 'testMethod', descriptor);
        await descriptor.value.call(target);
        expect(spy).toHaveBeenCalledWith(
            expect.stringContaining('Error on LogResetContext decorator: '),
            expect.objectContaining({
                class: 'TestClass',
                method: 'testMethod',
            }),
        );
        spy.mockRestore();
    });

    it('should work with different arguments', async () => {
        const descriptor = { value: originalMethod };
        LogResetContext()(target, 'testMethod', descriptor);
        await descriptor.value.call(target, 'a', 'b', 'c');
        expect(originalMethod).toHaveBeenCalledWith('a', 'b', 'c');
    });
});
