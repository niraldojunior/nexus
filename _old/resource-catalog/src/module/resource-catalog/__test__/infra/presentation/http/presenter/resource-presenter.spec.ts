import { BadRequestException } from '@nestjs/common';

import { ResourceCatalogPresenter } from '@/module/resource-catalog/infra/presentation/http/presenter/resource-catalog/resource-catalog.presenter';
import { ResourceCategoryPresenter } from '@/module/resource-catalog/infra/presentation/http/presenter/resource-category/resource-category.presenter';
import { ResourceSpecificationPresenter } from '@/module/resource-catalog/infra/presentation/http/presenter/resource-specification/resource-specification.presenter';
import { right } from '@/shared/application/type/either';

describe('TMF634 Resource Presenters', () => {
    const basePath = '/api/v1';

    describe('ResourceCatalogPresenter', () => {
        it('should map and filter selected fields', () => {
            const date = new Date();
            const result = ResourceCatalogPresenter.toHttp(
                right({
                    id: 'catalog-1',
                    name: 'Catalog A',
                    lifecycleStatus: 'Active',
                    updatedAt: date,
                }) as any,
                basePath,
                'id,name,lastUpdate',
            );

            expect(result).toEqual(
                expect.objectContaining({
                    id: 'catalog-1',
                    name: 'Catalog A',
                    lastUpdate: date.toISOString(),
                }),
            );
            expect((result as any).lifecycleStatus).toBeUndefined();
        });

        it('should throw 400 when fields are invalid', () => {
            expect(() =>
                ResourceCatalogPresenter.toHttp(
                    right({
                        id: 'catalog-1',
                        name: 'Catalog A',
                        lifecycleStatus: 'Active',
                    }) as any,
                    basePath,
                    'id,invalidField',
                ),
            ).toThrow(BadRequestException);
        });
    });

    describe('ResourceCategoryPresenter', () => {
        it('should map and filter selected fields', () => {
            const result = ResourceCategoryPresenter.toHttp(
                right({
                    id: 'category-1',
                    name: 'Category A',
                    lifecycleStatus: 'Active',
                    resourceCatalog: [],
                }) as any,
                basePath,
                'id,name',
            );

            expect(result).toEqual(
                expect.objectContaining({
                    id: 'category-1',
                    name: 'Category A',
                }),
            );
            expect((result as any).lifecycleStatus).toBeUndefined();
        });

        it('should throw 400 when fields are invalid', () => {
            expect(() =>
                ResourceCategoryPresenter.toHttp(
                    right({
                        id: 'category-1',
                        name: 'Category A',
                        lifecycleStatus: 'Active',
                        resourceCatalog: [],
                    }) as any,
                    basePath,
                    'id,badField',
                ),
            ).toThrow(BadRequestException);
        });
    });

    describe('ResourceSpecificationPresenter', () => {
        it('should map and filter selected fields', () => {
            const result = ResourceSpecificationPresenter.toHttp(
                right({
                    id: 'spec-1',
                    name: 'Spec A',
                    lifecycleStatus: 'Active',
                    uniqueKey: 'CAT-ROUTER|ZTE|F670L|STD',
                    resourceCatalog: [],
                    resourceCategory: [{ id: 'spec-1' }],
                    resourceSpecCharacteristic: [
                        { name: 'Brand', value: 'ZTE' },
                    ],
                }) as any,
                basePath,
                'id,name,resourceSpecCharacteristic',
            );

            expect(result).toEqual(
                expect.objectContaining({
                    id: 'spec-1',
                    name: 'Spec A',
                    resourceSpecCharacteristic: [
                        { name: 'Brand', value: 'ZTE' },
                    ],
                }),
            );
            expect((result as any).lifecycleStatus).toBeUndefined();
        });

        it('should throw 400 when fields are invalid', () => {
            expect(() =>
                ResourceSpecificationPresenter.toHttp(
                    right({
                        id: 'spec-1',
                        name: 'Spec A',
                        lifecycleStatus: 'Active',
                        uniqueKey: 'CAT-ROUTER|ZTE|F670L|STD',
                        resourceCatalog: [],
                        resourceCategory: [{ id: 'spec-1' }],
                    }) as any,
                    basePath,
                    'id,unknownField',
                ),
            ).toThrow(BadRequestException);
        });
    });
});
