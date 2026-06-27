import { CreateHubDto } from '@/module/resource-catalog/application/dto/hub/request/create-hub.dto';
import { Hub } from '@/module/resource-catalog/infra/presentation/http/controller/hub/hub.controller';
import { right } from '@/shared/application/type/either';

describe('HubController', () => {
    const listHubUseCaseMock = { exec: jest.fn() } as any;
    const createHubUseCaseMock = { exec: jest.fn() } as any;
    const deleteHubUseCaseMock = { exec: jest.fn() } as any;
    const createAuditUseCaseMock = { exec: jest.fn() } as any;

    const controller = new Hub(
        listHubUseCaseMock,
        createHubUseCaseMock,
        deleteHubUseCaseMock,
        createAuditUseCaseMock,
    );

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should list hub subscriptions and set pagination headers (happy path)', async () => {
        listHubUseCaseMock.exec.mockResolvedValue(
            right({
                items: [
                    {
                        id: 'hub-1',
                        callback: 'http://localhost:3001/listener/tmf634',
                        event: 'ResourceSpecificationCreateEvent',
                        active: true,
                    },
                ],
                total: 1,
            }),
        );

        const response = {
            header: jest.fn(),
        } as any;

        const result = await controller.list(
            { offset: 0, limit: 20 },
            response,
        );

        expect(result).toHaveLength(1);
        expect(response.header).toHaveBeenCalledWith('X-Result-Count', 1);
        expect(response.header).toHaveBeenCalledWith('X-Total-Count', 1);
    });

    it('should create a hub subscription (happy path)', async () => {
        const dto: CreateHubDto = {
            callback: 'http://localhost:3001/listener/tmf634',
            event: 'ResourceCatalogAttributeValueChangeEvent',
            '@type': 'Hub',
            '@baseType': 'Hub',
        };

        createHubUseCaseMock.exec.mockResolvedValue(
            right({
                id: 'hub-1',
                callback: dto.callback,
                active: true,
            }),
        );

        const result = await Promise.resolve(controller.create(dto, 'user-1'));

        expect(result.id).toBe('hub-1');
        expect(result.callback).toBe(dto.callback);
        expect(createHubUseCaseMock.exec).toHaveBeenCalledTimes(1);
    });

    it('should delete hub subscription (happy path)', async () => {
        deleteHubUseCaseMock.exec.mockResolvedValue(undefined);
        createAuditUseCaseMock.exec.mockResolvedValue(undefined);

        await expect(
            controller.delete('hub-1', 'user-1'),
        ).resolves.toBeUndefined();
        expect(deleteHubUseCaseMock.exec).toHaveBeenCalledWith('hub-1');
    });
});
