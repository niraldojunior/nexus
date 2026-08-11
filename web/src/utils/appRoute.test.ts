import { describe, expect, test } from 'vitest';
import {
  appRoutePath,
  categorySlug,
  parseAppRoute,
  resolveResourceCategorySlug,
  resolveServiceCategorySlug,
} from './appRoute';
import { DEFAULT_RESOURCE_CATEGORY_CODE } from '../data/resourceCategoryViews';
import { DEFAULT_SERVICE_CATEGORY_CODE } from '../data/serviceCategoryViews';

const desktop = { isMobile: false };
const mobile = { isMobile: true };

describe('categorySlug', () => {
  test('lowercases and replaces dots with dashes', () => {
    expect(categorySlug('Equipment.Access')).toBe('equipment-access');
    expect(categorySlug('Cable.OutsidePlant')).toBe('cable-outsideplant');
    expect(categorySlug('Access')).toBe('access');
  });
});

describe('slug resolution', () => {
  test('resolves known resource slugs and falls back to default', () => {
    expect(resolveResourceCategorySlug('logical-ipam')).toBe('Logical.IPAM');
    expect(resolveResourceCategorySlug('equipment-access')).toBe('Equipment.Access');
    expect(resolveResourceCategorySlug('does-not-exist')).toBe(DEFAULT_RESOURCE_CATEGORY_CODE);
  });

  test('resolves known service slugs and falls back to default', () => {
    expect(resolveServiceCategorySlug('access')).toBe('Access');
    expect(resolveServiceCategorySlug('does-not-exist')).toBe(DEFAULT_SERVICE_CATEGORY_CODE);
  });
});

describe('parseAppRoute', () => {
  test('root resolves by device', () => {
    expect(parseAppRoute('/', mobile)).toEqual({ page: 'geo' });
    expect(parseAppRoute('/', desktop)).toEqual({ page: 'research' });
  });

  test('unknown paths fall back to the device default', () => {
    expect(parseAppRoute('/nope', mobile)).toEqual({ page: 'geo' });
    expect(parseAppRoute('/nope', desktop)).toEqual({ page: 'research' });
  });

  test('static pages', () => {
    expect(parseAppRoute('/geo', desktop)).toEqual({ page: 'geo' });
    expect(parseAppRoute('/orders', desktop)).toEqual({ page: 'order' });
    expect(parseAppRoute('/conversations', desktop)).toEqual({ page: 'conversas' });
    expect(parseAppRoute('/new-conversation', desktop)).toEqual({ page: 'research' });
    expect(parseAppRoute('/assistant', desktop)).toEqual({ page: 'assistant' });
  });

  test('resource and service categories', () => {
    expect(parseAppRoute('/resources/logical-ipam', desktop)).toEqual({
      page: 'resource',
      resourceCategory: 'Logical.IPAM',
    });
    expect(parseAppRoute('/resources', desktop)).toEqual({
      page: 'resource',
      resourceCategory: DEFAULT_RESOURCE_CATEGORY_CODE,
    });
    expect(parseAppRoute('/services/access', desktop)).toEqual({
      page: 'service',
      serviceCategory: 'Access',
    });
  });

  test('sessions vs legacy mock conversations', () => {
    expect(parseAppRoute('/c/sess-123', desktop)).toEqual({
      page: 'research',
      sessionId: 'sess-123',
    });
    expect(parseAppRoute('/c/conversation-42', desktop)).toEqual({
      page: 'conversation',
      conversationId: 'conversation-42',
    });
  });

  test('trailing slash is ignored', () => {
    expect(parseAppRoute('/geo/', desktop)).toEqual({ page: 'geo' });
  });
});

describe('appRoutePath round-trips', () => {
  test('static and category paths', () => {
    expect(appRoutePath({ page: 'geo' })).toBe('/geo');
    expect(appRoutePath({ page: 'order' })).toBe('/orders');
    expect(appRoutePath({ page: 'conversas' })).toBe('/conversations');
    expect(appRoutePath({ page: 'assistant' })).toBe('/assistant');
    expect(appRoutePath({ page: 'research' })).toBe('/new-conversation');
    expect(appRoutePath({ page: 'resource', resourceCategory: 'Logical.IPAM' })).toBe(
      '/resources/logical-ipam',
    );
    expect(appRoutePath({ page: 'service', serviceCategory: 'Access' })).toBe('/services/access');
  });

  test('sessions and conversations', () => {
    expect(appRoutePath({ page: 'research', sessionId: 'sess-123' })).toBe('/c/sess-123');
    expect(appRoutePath({ page: 'conversation', conversationId: 'conversation-42' })).toBe(
      '/c/conversation-42',
    );
  });

  test('parse ∘ path is identity for canonical routes', () => {
    for (const path of [
      '/geo',
      '/orders',
      '/conversations',
      '/new-conversation',
      '/resources/logical-ipam',
      '/services/access',
      '/c/sess-9',
    ]) {
      expect(appRoutePath(parseAppRoute(path, desktop))).toBe(path);
    }
  });
});
