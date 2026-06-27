import { NotificationEvent } from '../const/notification-event.const';
import { ResourceCandidateModel } from '../model/resource-candidate.model';
import { ResourceCatalogModel } from '../model/resource-catalog.model';
import { ResourceCategoryModel } from '../model/resource-category.model';
import { ResourceSpecificationModel } from '../model/resource-specification.model';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ParsedHubQuery {
    /** Path segments after the leading "event." prefix (e.g. ["resourceSpecification","resourceCatalog","id"]) */
    path: string[];
    /** Allowed values to match against */
    values: string[];
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

/**
 * Parses a hub query string of the form:
 *   event.<resourceType>.<field>[.<subfield>]=value1,value2
 *
 * Returns null when the string cannot be parsed.
 */
export function parseHubQuery(query: string): ParsedHubQuery | null {
    if (!query || typeof query !== 'string') return null;

    const eqIdx = query.indexOf('=');
    if (eqIdx === -1) return null;

    const rawPath = query.slice(0, eqIdx).trim();
    const rawValues = query.slice(eqIdx + 1).trim();

    if (!rawPath || !rawValues) return null;

    const segments = rawPath.split('.');
    // Minimum: "event.<resourceType>.<field>"
    if (segments.length < 3 || segments[0] !== 'event') return null;

    const path = segments.slice(1); // drop leading "event"
    const values = rawValues
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean);

    if (!values.length) return null;

    return { path, values };
}

// ---------------------------------------------------------------------------
// Evaluator
// ---------------------------------------------------------------------------

/**
 * Evaluates whether an event payload satisfies a parsed hub query.
 * Never throws — returns true (pass through) on any unexpected structure so
 * that a broken query never silently drops a notification.
 */
export function evaluateHubQuery(
    eventPayload: unknown,
    parsed: ParsedHubQuery,
): boolean {
    try {
        return traverseAndMatch(eventPayload, parsed.path, parsed.values);
    } catch {
        return true; // fail-open
    }
}

function traverseAndMatch(
    node: unknown,
    path: string[],
    values: string[],
): boolean {
    if (path.length === 0) {
        if (node === null || node === undefined) return false;
        return values.includes(String(node));
    }

    if (Array.isArray(node)) {
        // For array nodes, the match succeeds if ANY element satisfies the rest of the path
        return node.some((item) => traverseAndMatch(item, path, values));
    }

    if (typeof node !== 'object' || node === null) return false;

    const [head, ...rest] = path;
    const next = (node as Record<string, unknown>)[head];
    return traverseAndMatch(next, rest, values);
}

// ---------------------------------------------------------------------------
// Pre-validation helpers
// ---------------------------------------------------------------------------

const EVENT_TO_RESOURCE_TYPE: Partial<Record<NotificationEvent, string>> = {
    ResourceCatalogCreateEvent: 'resourceCatalog',
    ResourceCatalogDeleteEvent: 'resourceCatalog',
    ResourceCatalogStatusChangeEvent: 'resourceCatalog',
    ResourceCatalogAttributeValueChangeEvent: 'resourceCatalog',
    ResourceCategoryCreateEvent: 'resourceCategory',
    ResourceCategoryDeleteEvent: 'resourceCategory',
    ResourceCategoryStatusChangeEvent: 'resourceCategory',
    ResourceCategoryAttributeValueChangeEvent: 'resourceCategory',
    ResourceSpecificationCreateEvent: 'resourceSpecification',
    ResourceSpecificationDeleteEvent: 'resourceSpecification',
    ResourceSpecificationStatusChangeEvent: 'resourceSpecification',
    ResourceSpecificationAttributeValueChangeEvent: 'resourceSpecification',
    ResourceCandidateCreateEvent: 'resourceCandidate',
    ResourceCandidateStatusChangeEvent: 'resourceCandidate',
    ResourceCandidateAttributeValueChangeEvent: 'resourceCandidate',
};

const RESOURCE_TYPE_PROPERTY_KEYS: Record<string, readonly string[]> = {
    resourceCatalog: ResourceCatalogModel.propertyKeys,
    resourceCategory: ResourceCategoryModel.propertyKeys,
    resourceSpecification: ResourceSpecificationModel.propertyKeys,
    resourceCandidate: ResourceCandidateModel.propertyKeys,
};

/**
 * Validates that a raw query string is structurally valid for the given event type.
 *
 * @returns An error message string when invalid, or null when the query is valid.
 */
export function validateHubQueryForEvent(
    query: string,
    event: NotificationEvent,
): string | null {
    const parsed = parseHubQuery(query);
    if (!parsed) {
        return 'Invalid query format. Expected: event.<resourceType>.<field>=value1,value2';
    }

    const expectedResourceType = EVENT_TO_RESOURCE_TYPE[event];
    if (!expectedResourceType) {
        return `Cannot determine resource type for event: ${event}`;
    }

    if (parsed.path[0] !== expectedResourceType) {
        return `Query path must start with "event.${expectedResourceType}" for event "${event}"`;
    }

    const propertyKeys = RESOURCE_TYPE_PROPERTY_KEYS[expectedResourceType];
    if (propertyKeys && parsed.path.length >= 2) {
        const fieldName = parsed.path[1];
        if (!(propertyKeys as readonly string[]).includes(fieldName)) {
            return `Field "${fieldName}" does not exist on "${expectedResourceType}" resource. Valid fields: ${propertyKeys.join(', ')}`;
        }
    }

    return null;
}
