import { ValidationPipe } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { CreateResourceCatalogDto } from '@/module/resource-catalog/application/dto/resource-catalog/request/create-resource-catalog.dto';
import { ListResourceCatalogQueryDto } from '@/module/resource-catalog/application/dto/resource-catalog/request/list-resource-catalog-query.dto';
import { ResourceCatalog } from '@/module/resource-catalog/infra/presentation/http/controller/resource-catalog/resource-catalog.controller';
import { right } from '@/shared/application/type/either';

describe('ResourceCatalogController', () => {
    const createUseCaseMock = { exec: jest.fn() } as any;
    const listUseCaseMock = { exec: jest.fn() } as any;
    const getUseCaseMock = { exec: jest.fn() } as any;
    const patchUseCaseMock = { exec: jest.fn() } as any;
    const createAuditUseCaseMock = { exec: jest.fn() } as any;

    const controller = new ResourceCatalog(
        createUseCaseMock,
        listUseCaseMock,
        getUseCaseMock,
        patchUseCaseMock,
        createAuditUseCaseMock,
    );

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should list resource catalogs and set pagination headers (happy path)', async () => {
        listUseCaseMock.exec.mockResolvedValue(
            right({
                items: [
                    {
                        id: 'catalog-1',
                        href: '/api/v1/resourceCatalog/catalog-1',
                        name: 'Corporate Resource Catalog',
                        lifecycleStatus: 'Active',
                    },
                ],
                total: 1,
            }),
        );

        const response = {
            header: jest.fn(),
        } as any;

        const result = await Promise.resolve(
            controller.list({ offset: 0, limit: 20 }, response),
        );

        expect(result).toHaveLength(1);
        expect(response.header).toHaveBeenCalledWith('X-Result-Count', 1);
        expect(response.header).toHaveBeenCalledWith('X-Total-Count', 1);
    });

    it('should reject invalid datetime on DTO validation (invalid validation)', async () => {
        const payload = plainToInstance(CreateResourceCatalogDto, {
            name: 'Corporate Resource Catalog',
            validFor: {
                startDateTime: 'not-a-datetime',
            },
        });

        const errors = await validate(payload);
        expect(errors.length).toBeGreaterThan(0);

        const pipe = new ValidationPipe({ transform: true, whitelist: true });

        await expect(
            pipe.transform(
                {
                    name: 'Corporate Resource Catalog',
                    validFor: { startDateTime: 'not-a-datetime' },
                },
                {
                    type: 'body',
                    metatype: CreateResourceCatalogDto,
                    data: '',
                },
            ),
        ).rejects.toBeDefined();
    });

    it('should filter list payload by fields selection', async () => {
        listUseCaseMock.exec.mockResolvedValue(
            right({
                items: [
                    {
                        id: 'catalog-1',
                        href: '/api/v1/resourceCatalog/catalog-1',
                        name: 'Corporate Resource Catalog',
                        description: 'hidden in field selection',
                        lifecycleStatus: 'Active',
                    },
                ],
                total: 1,
            }),
        );

        const response = {
            header: jest.fn(),
        } as any;

        const result = await controller.list({ fields: 'id,name' }, response);

        expect(result[0]).toEqual(
            expect.objectContaining({
                id: 'catalog-1',
                name: 'Corporate Resource Catalog',
            }),
        );
        expect((result[0] as any).description).toBeUndefined();
    });

    it('should reject invalid fields selection (400)', async () => {
        listUseCaseMock.exec.mockResolvedValue(
            right({
                items: [
                    {
                        id: 'catalog-1',
                        href: '/api/v1/resourceCatalog/catalog-1',
                        name: 'Corporate Resource Catalog',
                    },
                ],
                total: 1,
            }),
        );

        const response = {
            header: jest.fn(),
        } as any;

        await expect(
            controller.list({ fields: 'id,unknownField' }, response),
        ).rejects.toMatchObject({ status: 400 });
    });

    it('should reject list query limit over max (400)', async () => {
        const pipe = new ValidationPipe({ transform: true, whitelist: true });

        await expect(
            pipe.transform(
                { offset: 0, limit: 201 },
                {
                    type: 'query',
                    metatype: ListResourceCatalogQueryDto,
                    data: '',
                },
            ),
        ).rejects.toBeDefined();
    });

    it('should create a resource catalog and return the created entity', async () => {
        const model = {
            id: 'catalog-1',
            href: undefined,
            name: 'Corporate',
            lifecycleStatus: 'Active',
        };
        createUseCaseMock.exec.mockResolvedValue({
            isLeft: () => false,
            isRight: () => true,
            value: model,
        });
        createAuditUseCaseMock.exec.mockResolvedValue(undefined);

        const result = await controller.create(
            { name: 'Corporate', lifecycleStatus: 'Active' } as any,
            'user-1',
        );

        expect(createUseCaseMock.exec).toHaveBeenCalledTimes(1);
        expect(result).toMatchObject({ id: 'catalog-1' });
    });

    it('should get a resource catalog by id', async () => {
        const model = {
            id: 'catalog-1',
            href: undefined,
            name: 'Corporate',
            lifecycleStatus: 'Active',
        };
        getUseCaseMock.exec.mockResolvedValue({
            isLeft: () => false,
            isRight: () => true,
            value: model,
        });

        const result = await controller.get('catalog-1');

        expect(getUseCaseMock.exec).toHaveBeenCalledWith('catalog-1');
        expect(result).toMatchObject({ id: 'catalog-1' });
    });

    it('should patch a resource catalog and return the updated entity', async () => {
        const model = {
            id: 'catalog-1',
            href: undefined,
            name: 'Updated',
            lifecycleStatus: 'Active',
        };
        patchUseCaseMock.exec.mockResolvedValue({
            isLeft: () => false,
            isRight: () => true,
            value: model,
        });
        createAuditUseCaseMock.exec.mockResolvedValue(undefined);

        const result = await controller.patch(
            'catalog-1',
            { name: 'Updated' } as any,
            'user-1',
        );

        expect(patchUseCaseMock.exec).toHaveBeenCalledWith('catalog-1', {
            name: 'Updated',
        });
        expect(result).toMatchObject({ id: 'catalog-1', name: 'Updated' });
    });

    it('should throw when create use case returns left', async () => {
        createUseCaseMock.exec.mockResolvedValue({
            isLeft: () => true,
            isRight: () => false,
            value: new Error('fail'),
        });

        await expect(
            controller.create({ name: 'Corp' } as any, 'user-1'),
        ).rejects.toBeDefined();
    });

    it('should throw when get use case returns left', async () => {
        getUseCaseMock.exec.mockResolvedValue({
            isLeft: () => true,
            isRight: () => false,
            value: new Error('not found'),
        });

        await expect(controller.get('missing')).rejects.toBeDefined();
    });

    it('should throw when patch use case returns left', async () => {
        patchUseCaseMock.exec.mockResolvedValue({
            isLeft: () => true,
            isRight: () => false,
            value: new Error('not found'),
        });

        await expect(
            controller.patch('missing', {} as any, 'user-1'),
        ).rejects.toBeDefined();
    });
});
