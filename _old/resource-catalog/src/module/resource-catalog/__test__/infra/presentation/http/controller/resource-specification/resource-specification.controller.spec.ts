import {
    ConflictException,
    UnprocessableEntityException,
    ValidationPipe,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { CreateResourceSpecificationDto } from '@/module/resource-catalog/application/dto/resource-specification/request/create-resource-specification.dto';
import { ResourceSpecification } from '@/module/resource-catalog/infra/presentation/http/controller/resource-specification/resource-specification.controller';
import { right } from '@/shared/application/type/either';

describe('ResourceSpecificationController', () => {
    const createUseCaseMock = { exec: jest.fn() } as any;
    const listUseCaseMock = { exec: jest.fn() } as any;
    const getUseCaseMock = { exec: jest.fn() } as any;
    const patchUseCaseMock = { exec: jest.fn() } as any;
    const createAuditUseCaseMock = { exec: jest.fn() } as any;

    const controller = new ResourceSpecification(
        createUseCaseMock,
        listUseCaseMock,
        getUseCaseMock,
        patchUseCaseMock,
        createAuditUseCaseMock,
    );

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should list resource specifications and set pagination headers (happy path)', async () => {
        listUseCaseMock.exec.mockResolvedValue(
            right({
                items: [
                    {
                        id: 'spec-1',
                        href: '/api/v1/resourceSpecification/spec-1',
                        name: 'CPE ZTE F670L',
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
        const payload = plainToInstance(CreateResourceSpecificationDto, {
            name: 'CPE ZTE F670L',
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
                    name: 'CPE ZTE F670L',
                    validFor: { startDateTime: 'not-a-datetime' },
                },
                {
                    type: 'body',
                    metatype: CreateResourceSpecificationDto,
                    data: '',
                },
            ),
        ).rejects.toBeDefined();
    });

    it('should propagate UnprocessableEntityException (422) from use case when minimum structure is invalid', async () => {
        createUseCaseMock.exec.mockRejectedValue(
            new UnprocessableEntityException(
                'resourceCategory[0].id is required; characteristic Brand is required',
            ),
        );

        await expect(
            controller.create(
                {
                    name: 'Incomplete',
                } as CreateResourceSpecificationDto,
                'user-1',
            ),
        ).rejects.toMatchObject({ status: 422 });
    });

    it('should propagate ConflictException (409) from use case when uniqueKey conflicts', async () => {
        createUseCaseMock.exec.mockRejectedValue(
            new ConflictException(
                'A ResourceSpecification with the same corporate key already exists',
            ),
        );

        await expect(
            controller.create(
                {
                    name: 'CPE ZTE F670L',
                    resourceCategory: [{ id: 'cat-router' }],
                    resourceSpecCharacteristic: [
                        { name: 'Brand', value: 'ZTE' },
                        { name: 'Model', value: 'F670L' },
                        { name: 'categoria', value: 'P' },
                    ],
                } as CreateResourceSpecificationDto,
                'user-1',
            ),
        ).rejects.toMatchObject({ status: 409 });
    });

    it('should filter list payload by fields selection', async () => {
        listUseCaseMock.exec.mockResolvedValue(
            right({
                items: [
                    {
                        id: 'spec-1',
                        href: '/api/v1/resourceSpecification/spec-1',
                        name: 'CPE ZTE F670L',
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

        const result = await Promise.resolve(
            controller.list({ fields: 'id,name' }, response),
        );

        expect(result[0]).toEqual(
            expect.objectContaining({ id: 'spec-1', name: 'CPE ZTE F670L' }),
        );
        expect((result[0] as any).description).toBeUndefined();
    });

    it('should reject invalid fields selection (400)', async () => {
        listUseCaseMock.exec.mockResolvedValue(
            right({
                items: [
                    {
                        id: 'spec-1',
                        href: '/api/v1/resourceSpecification/spec-1',
                        name: 'CPE ZTE F670L',
                    },
                ],
                total: 1,
            }),
        );

        const response = {
            header: jest.fn(),
        } as any;

        await expect(
            controller.list({ fields: 'id,badField' }, response),
        ).rejects.toMatchObject({ status: 400 });
    });

    it('should create a resource specification and return the created entity', async () => {
        const model = {
            id: 'spec-1',
            href: undefined,
            name: 'CPE ZTE F670L',
            lifecycleStatus: 'Active',
            uniqueKey: 'CAT-ROUTER|ZTE|F670L|STD',
            resourceCatalog: [],
            resourceCategory: [],
            resourceSpecCharacteristic: [],
        };
        createUseCaseMock.exec.mockResolvedValue({
            isLeft: () => false,
            isRight: () => true,
            value: model,
        });
        createAuditUseCaseMock.exec.mockResolvedValue(undefined);

        const result = await controller.create(
            { name: 'CPE ZTE F670L' } as any,
            'user-1',
        );

        expect(createUseCaseMock.exec).toHaveBeenCalledTimes(1);
        expect(result).toMatchObject({ id: 'spec-1' });
    });

    it('should get a resource specification by id', async () => {
        const model = {
            id: 'spec-1',
            href: undefined,
            name: 'CPE ZTE',
            lifecycleStatus: 'Active',
            resourceCatalog: [],
            resourceCategory: [],
            resourceSpecCharacteristic: [],
        };
        getUseCaseMock.exec.mockResolvedValue({
            isLeft: () => false,
            isRight: () => true,
            value: model,
        });

        const result = await controller.get('spec-1');

        expect(getUseCaseMock.exec).toHaveBeenCalledWith('spec-1');
        expect(result).toMatchObject({ id: 'spec-1' });
    });

    it('should patch a resource specification and return the updated entity', async () => {
        const model = {
            id: 'spec-1',
            href: undefined,
            name: 'Updated',
            lifecycleStatus: 'Active',
            resourceCatalog: [],
            resourceCategory: [],
            resourceSpecCharacteristic: [],
        };
        patchUseCaseMock.exec.mockResolvedValue({
            isLeft: () => false,
            isRight: () => true,
            value: model,
        });
        createAuditUseCaseMock.exec.mockResolvedValue(undefined);

        const result = await controller.patch(
            'spec-1',
            { name: 'Updated' } as any,
            'user-1',
        );

        expect(patchUseCaseMock.exec).toHaveBeenCalledWith(
            'spec-1',
            { name: 'Updated' },
            expect.any(String),
        );
        expect(result).toMatchObject({ id: 'spec-1' });
    });

    it('should throw on create when use case returns left', async () => {
        createUseCaseMock.exec.mockResolvedValue({
            isLeft: () => true,
            isRight: () => false,
            value: new Error('fail'),
        });

        await expect(
            controller.create({ name: 'CPE' } as any, 'user-1'),
        ).rejects.toBeDefined();
    });

    it('should throw on get when use case returns left', async () => {
        getUseCaseMock.exec.mockResolvedValue({
            isLeft: () => true,
            isRight: () => false,
            value: new Error('nf'),
        });

        await expect(controller.get('missing')).rejects.toBeDefined();
    });

    it('should throw on patch when use case returns left', async () => {
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
