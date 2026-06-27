import { Logger } from '@nestjs/common';

import { BadRequestError } from '@/shared/application/error/bad-request.error';
import { UnprocessableEntityError } from '@/shared/application/error/unprocessable-entity.error';
import { CompressAlgorithm } from '@/shared/application/port/compress/compress.repository';
import { LzHandler } from '@/shared/infra/service/lz/lz.handler';
import { LzService } from '@/shared/infra/service/lz/lz.service';
jest.mock('@/shared/infra/service/lz/lz.handler', () => ({
    LzHandler: {
        compressToUTF16: jest.fn(),
        compressToBase64: jest.fn(),
        compressToEncodedURIComponent: jest.fn(),
        compressToUint8Array: jest.fn(),
        decompressFromUTF16: jest.fn(),
        decompressFromBase64: jest.fn(),
        decompressFromEncodedURIComponent: jest.fn(),
    },
}));

jest.spyOn(Logger, 'debug').mockReturnValue(undefined);
describe('LzService', () => {
    let service: LzService;

    beforeEach(() => {
        jest.clearAllMocks();
        service = new LzService();
    });

    describe('compress', () => {
        it('should return input if falsy', () => {
            expect(service.compress('')).toBe('');
            expect(service.compress(null as any)).toBeNull();
            expect(service.compress(undefined as any)).toBeUndefined();
        });

        it('should use UTF16 for DEFAULT and UTF16', () => {
            (LzHandler.compressToUTF16 as jest.Mock).mockReturnValue('utf16');
            expect(service.compress('abc')).toBe('utf16');
            expect(
                service.compress('abc', { algorithm: CompressAlgorithm.UTF16 }),
            ).toBe('utf16');
        });

        it('should use BASE64', () => {
            (LzHandler.compressToBase64 as jest.Mock).mockReturnValue('b64');
            expect(
                service.compress('abc', {
                    algorithm: CompressAlgorithm.BASE64,
                }),
            ).toBe('b64');
        });

        it('should use ENCODED_URI_COMPONENT', () => {
            (
                LzHandler.compressToEncodedURIComponent as jest.Mock
            ).mockReturnValue('uri');
            expect(
                service.compress('abc', {
                    algorithm: CompressAlgorithm.ENCODED_URI_COMPONENT,
                }),
            ).toBe('uri');
        });

        it('should use UINT8', () => {
            (LzHandler.compressToUint8Array as jest.Mock).mockReturnValue([
                1, 2, 3,
            ]);
            expect(
                service.compress('abc', { algorithm: CompressAlgorithm.UINT8 }),
            ).toBe('1,2,3');
        });

        it('should throw BadRequestError for unsupported algorithm', () => {
            expect(() =>
                service.compress('abc', { algorithm: 'INVALID' as any }),
            ).not.toThrow(BadRequestError);
            expect(Logger.debug).toHaveBeenCalled();
        });

        it('should log and return input on error', () => {
            (LzHandler.compressToUTF16 as jest.Mock).mockImplementation(() => {
                throw new Error('fail');
            });
            expect(service.compress('abc')).toBe('abc');
            expect(Logger.debug).toHaveBeenCalled();
        });
    });

    describe('decompress', () => {
        it('should return input if falsy', () => {
            expect(service.decompress('')).toBe('');
            expect(service.decompress(null as any)).toBeNull();
            expect(service.decompress(undefined as any)).toBeUndefined();
        });

        it('should use UTF16 for DEFAULT and UTF16', () => {
            (LzHandler.decompressFromUTF16 as jest.Mock).mockReturnValue(
                'utf16',
            );
            expect(service.decompress('abc')).toBe('utf16');
            expect(
                service.decompress('abc', {
                    algorithm: CompressAlgorithm.UTF16,
                }),
            ).toBe('utf16');
        });

        it('should use BASE64', () => {
            (LzHandler.decompressFromBase64 as jest.Mock).mockReturnValue(
                'b64',
            );
            expect(
                service.decompress('abc', {
                    algorithm: CompressAlgorithm.BASE64,
                }),
            ).toBe('b64');
        });

        it('should use ENCODED_URI_COMPONENT', () => {
            (
                LzHandler.decompressFromEncodedURIComponent as jest.Mock
            ).mockReturnValue('uri');
            expect(
                service.decompress('abc', {
                    algorithm: CompressAlgorithm.ENCODED_URI_COMPONENT,
                }),
            ).toBe('uri');
        });

        it('should not throw UnprocessableEntityError for UINT8', () => {
            expect(() =>
                service.decompress('abc', {
                    algorithm: CompressAlgorithm.UINT8,
                }),
            ).not.toThrow(UnprocessableEntityError);
            expect(Logger.debug).toHaveBeenCalled();
        });

        it('should log and return input on error', () => {
            expect(
                service.decompress('abc', { algorithm: 'INVALID' as any }),
            ).toBe('abc');
            expect(Logger.debug).toHaveBeenCalled();
        });
    });
});
