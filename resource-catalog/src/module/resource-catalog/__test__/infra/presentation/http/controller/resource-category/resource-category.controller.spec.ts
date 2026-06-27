import { ValidationPipe } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { CreateResourceCategoryDto } from '@/module/resource-catalog/application/dto/resource-category/request/create-resource-category.dto';
import { ResourceCategory } from '@/module/resource-catalog/infra/presentation/http/controller/resource-category/resource-category.controller';
import { right } from '@/shared/application/type/either';

describe('ResourceCategoryController', () => {
    const createUseCaseMock = { exec: jest.fn() } as any;
    const listUseCaseMock = { exec: jest.fn() } as any;
    const getUseCaseMock = { exec: jest.fn() } as any;
    const patchUseCaseMock = { exec: jest.fn() } as any;
    const createAuditUseCaseMock = { exec: jest.fn() } as any;

    const controller = new ResourceCategory(
        createUseCaseMock,
        listUseCaseMock,
        getUseCaseMock,
        patchUseCaseMock,
        createAuditUseCaseMock,
    );

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should list resource categories and set pagination headers (happy path)', async () => {
        listUseCaseMock.exec.mockResolvedValue(
            right({
                items: [
                    {
                        id: 'category-1',
                        href: '/api/v1/resourceCategory/category-1',
                        name: 'Roteador',
                        lifecycleStatus: 'Active',
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

    it('should reject invalid datetime on DTO validation (invalid validation)', async () => {
        const payload = plainToInstance(CreateResourceCategoryDto, {
            name: 'Roteador',
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
                    name: 'Roteador',
                    validFor: { startDateTime: 'not-a-datetime' },
                },
                {
                    type: 'body',
                    metatype: CreateResourceCategoryDto,
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
                        id: 'category-1',
                        href: '/api/v1/resourceCategory/category-1',
                        name: 'Roteador',
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
            expect.objectContaining({ id: 'category-1', name: 'Roteador' }),
        );
        expect((result[0] as any).description).toBeUndefined();
    });

    it('should reject invalid fields selection (400)', async () => {
        listUseCaseMock.exec.mockResolvedValue(
            right({
                items: [
                    {
                        id: 'category-1',
                        href: '/api/v1/resourceCategory/category-1',
                        name: 'Roteador',
                    },
                ],
                total: 1,
            }),
        );

        const response = {
            header: jest.fn(),
        } as any;

        await expect(
            controller.list({ fields: 'id,invalidField' }, response),
        ).rejects.toMatchObject({ status: 400 });
    });

    it('should create a resource category and return the created entity', async () => {
        const model = {
            id: 'cat-1',
            href: undefined,
            name: 'Roteador',
            lifecycleStatus: 'Active',
            resourceCatalog: [],
        };
        createUseCaseMock.exec.mockResolvedValue({
            isLeft: () => false,
            isRight: () => true,
            value: model,
        });
        createAuditUseCaseMock.exec.mockResolvedValue(undefined);

        const result = await controller.create(
            { name: 'Roteador', lifecycleStatus: 'Active' } as any,
            'user-1',
        );

        expect(createUseCaseMock.exec).toHaveBeenCalledTimes(1);
        expect(result).toMatchObject({ id: 'cat-1' });
    });

    it('should get a resource category by id', async () => {
        const model = {
            id: 'cat-1',
            href: undefined,
            name: 'Roteador',
            lifecycleStatus: 'Active',
            resourceCatalog: [],
        };
        getUseCaseMock.exec.mockResolvedValue({
            isLeft: () => false,
            isRight: () => true,
            value: model,
        });

        const result = await controller.get('cat-1');

        expect(getUseCaseMock.exec).toHaveBeenCalledWith('cat-1');
        expect(result).toMatchObject({ id: 'cat-1' });
    });

    it('should patch a resource category and return the updated entity', async () => {
        const model = {
            id: 'cat-1',
            href: undefined,
            name: 'Updated',
            lifecycleStatus: 'Active',
            resourceCatalog: [],
        };
        patchUseCaseMock.exec.mockResolvedValue({
            isLeft: () => false,
            isRight: () => true,
            value: model,
        });
        createAuditUseCaseMock.exec.mockResolvedValue(undefined);

        const result = await controller.patch(
            'cat-1',
            { name: 'Updated' } as any,
            'user-1',
        );

        expect(patchUseCaseMock.exec).toHaveBeenCalledWith('cat-1', {
            name: 'Updated',
        });
        expect(result).toMatchObject({ id: 'cat-1' });
    });

    it('should throw when create use case returns left', async () => {
        createUseCaseMock.exec.mockResolvedValue({
            isLeft: () => true,
            isRight: () => false,
            value: new Error('fail'),
        });

        await expect(
            controller.create({ name: 'R' } as any, 'user-1'),
        ).rejects.toBeDefined();
    });

    it('should throw when get use case returns left', async () => {
        getUseCaseMock.exec.mockResolvedValue({
            isLeft: () => true,
            isRight: () => false,
            value: new Error('nf'),
        });

        await expect(controller.get('missing')).rejects.toBeDefined();
    });

    it('should throw when patch use case returns left', async () => {
        patchUseCaseMock.exec.mockResolvedValue({
            isLeft: () => true,
            isRight: () => false,
            value: new Error('nf'),
        });

        await expect(
            controller.patch('missing', {} as any, 'user-1'),
        ).rejects.toBeDefined();
    });
});
