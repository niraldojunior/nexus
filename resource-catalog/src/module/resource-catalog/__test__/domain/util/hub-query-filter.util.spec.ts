import {
    evaluateHubQuery,
    ParsedHubQuery,
    parseHubQuery,
    validateHubQueryForEvent,
} from '@/module/resource-catalog/domain/util/hub-query-filter.util';

// ---------------------------------------------------------------------------
// parseHubQuery
// ---------------------------------------------------------------------------

describe('parseHubQuery', () => {
    it('should parse a simple path with a single value', () => {
        const result = parseHubQuery('event.resourceSpecification.id=spec-1');
        expect(result).toEqual({
            path: ['resourceSpecification', 'id'],
            values: ['spec-1'],
        });
    });

    it('should parse a deep path with multiple comma-separated values', () => {
        const result = parseHubQuery(
            'event.resourceSpecification.resourceCatalog.id=cat-1,cat-2,cat-3',
        );
        expect(result).toEqual({
            path: ['resourceSpecification', 'resourceCatalog', 'id'],
            values: ['cat-1', 'cat-2', 'cat-3'],
        });
    });

    it('should trim whitespace from path and values', () => {
        const result = parseHubQuery(
            ' event.resourceCatalog.name = foo , bar ',
        );
        expect(result).toEqual({
            path: ['resourceCatalog', 'name'],
            values: ['foo', 'bar'],
        });
    });

    it('should return null when there is no "=" sign', () => {
        expect(parseHubQuery('event.resourceSpecification.id')).toBeNull();
    });

    it('should return null when the path does not start with "event"', () => {
        expect(parseHubQuery('resource.specification.id=1')).toBeNull();
    });

    it('should return null when path has fewer than 3 segments', () => {
        expect(parseHubQuery('event.resourceSpecification=1')).toBeNull();
    });

    it('should return null when values are empty after "="', () => {
        expect(parseHubQuery('event.resourceSpecification.id=')).toBeNull();
    });

    it('should return null when values reduce to empty after trimming commas', () => {
        expect(parseHubQuery('event.resourceSpecification.id= , ')).toBeNull();
    });

    it('should return null for an empty string', () => {
        expect(parseHubQuery('')).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// evaluateHubQuery
// ---------------------------------------------------------------------------

describe('evaluateHubQuery', () => {
    const makeQuery = (path: string[], values: string[]): ParsedHubQuery => ({
        path,
        values,
    });

    it('should match a plain scalar field value', () => {
        const payload = { resourceCatalog: { name: 'Fixtures' } };
        const query = makeQuery(['resourceCatalog', 'name'], ['Fixtures']);
        expect(evaluateHubQuery(payload, query)).toBe(true);
    });

    it('should return false when a plain scalar field value does not match', () => {
        const payload = { resourceCatalog: { name: 'Other' } };
        const query = makeQuery(['resourceCatalog', 'name'], ['Fixtures']);
        expect(evaluateHubQuery(payload, query)).toBe(false);
    });

    it('should match when the target value is one of multiple allowed values', () => {
        const payload = { resourceSpecification: { id: 'spec-2' } };
        const query = makeQuery(
            ['resourceSpecification', 'id'],
            ['spec-1', 'spec-2', 'spec-3'],
        );
        expect(evaluateHubQuery(payload, query)).toBe(true);
    });

    it('should match when traversing through an array (any-element match)', () => {
        const payload = {
            resourceSpecification: {
                resourceCatalog: [{ id: 'cat-99' }, { id: 'cat-1' }],
            },
        };
        const query = makeQuery(
            ['resourceSpecification', 'resourceCatalog', 'id'],
            ['cat-1'],
        );
        expect(evaluateHubQuery(payload, query)).toBe(true);
    });

    it('should return false when no array element matches', () => {
        const payload = {
            resourceSpecification: {
                resourceCatalog: [{ id: 'cat-10' }, { id: 'cat-20' }],
            },
        };
        const query = makeQuery(
            ['resourceSpecification', 'resourceCatalog', 'id'],
            ['cat-1'],
        );
        expect(evaluateHubQuery(payload, query)).toBe(false);
    });

    it('should return false when the path leads to null', () => {
        const payload = { resourceSpecification: { id: null } };
        const query = makeQuery(['resourceSpecification', 'id'], ['spec-1']);
        expect(evaluateHubQuery(payload, query)).toBe(false);
    });

    it('should return false when the path leads to undefined', () => {
        const payload = { resourceSpecification: {} };
        const query = makeQuery(['resourceSpecification', 'id'], ['spec-1']);
        expect(evaluateHubQuery(payload, query)).toBe(false);
    });

    it('should return false when an intermediate node is not an object', () => {
        const payload = { resourceSpecification: 'not-an-object' };
        const query = makeQuery(['resourceSpecification', 'id'], ['spec-1']);
        expect(evaluateHubQuery(payload, query)).toBe(false);
    });

    it('should return false when the payload is null (no match, no throw)', () => {
        const query = makeQuery(['resourceSpecification', 'id'], ['spec-1']);
        expect(evaluateHubQuery(null, query)).toBe(false);
    });

    it('should return false when the payload is undefined (no match, no throw)', () => {
        const query = makeQuery(['resourceSpecification', 'id'], ['spec-1']);
        expect(evaluateHubQuery(undefined, query)).toBe(false);
    });

    it('should return true (fail-open) when traversal throws internally', () => {
        // A Proxy that throws on property access triggers the catch-block fail-open
        const throwing = new Proxy(
            {},
            {
                get() {
                    throw new Error('boom');
                },
            },
        );
        const query = makeQuery(['resourceSpecification', 'id'], ['spec-1']);
        expect(evaluateHubQuery(throwing, query)).toBe(true);
    });

    it('should coerce numeric field values to string for comparison', () => {
        const payload = { resourceCatalog: { version: 3 } };
        const query = makeQuery(['resourceCatalog', 'version'], ['3']);
        expect(evaluateHubQuery(payload, query)).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// validateHubQueryForEvent
// ---------------------------------------------------------------------------

describe('validateHubQueryForEvent', () => {
    it('should return null for a valid query matching the event resource type', () => {
        const error = validateHubQueryForEvent(
            'event.resourceSpecification.id=spec-1',
            'ResourceSpecificationCreateEvent',
        );
        expect(error).toBeNull();
    });

    it('should return null for a valid deep path', () => {
        const error = validateHubQueryForEvent(
            'event.resourceSpecification.resourceCatalog=cat-1',
            'ResourceSpecificationCreateEvent',
        );
        expect(error).toBeNull();
    });

    it('should return an error when the query format is invalid', () => {
        const error = validateHubQueryForEvent(
            'not-a-valid-query',
            'ResourceSpecificationCreateEvent',
        );
        expect(error).not.toBeNull();
        expect(error).toMatch(/Invalid query format/i);
    });

    it('should return an error when the path resource type does not match the event', () => {
        const error = validateHubQueryForEvent(
            'event.resourceCatalog.id=cat-1',
            'ResourceSpecificationCreateEvent',
        );
        expect(error).not.toBeNull();
        expect(error).toMatch(
            /must start with "event\.resourceSpecification"/i,
        );
    });

    it('should return an error when the field does not exist on the resource model', () => {
        const error = validateHubQueryForEvent(
            'event.resourceSpecification.nonExistentField=value',
            'ResourceSpecificationCreateEvent',
        );
        expect(error).not.toBeNull();
        expect(error).toMatch(/nonExistentField/);
        expect(error).toMatch(/does not exist/i);
    });

    it('should accept a valid field for ResourceCatalog events', () => {
        const error = validateHubQueryForEvent(
            'event.resourceCatalog.name=Fixtures',
            'ResourceCatalogCreateEvent',
        );
        expect(error).toBeNull();
    });

    it('should accept a valid field for ResourceCategory events', () => {
        const error = validateHubQueryForEvent(
            'event.resourceCategory.name=Fixtures',
            'ResourceCategoryCreateEvent',
        );
        expect(error).toBeNull();
    });

    it('should accept a valid field for ResourceCandidate events', () => {
        const error = validateHubQueryForEvent(
            'event.resourceCandidate.name=Fixtures',
            'ResourceCandidateCreateEvent',
        );
        expect(error).toBeNull();
    });
});
