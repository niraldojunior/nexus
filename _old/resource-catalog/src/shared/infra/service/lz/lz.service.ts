import { Logger } from '@nestjs/common';

import { BadRequestError } from '@/shared/application/error/bad-request.error';
import { UnprocessableEntityError } from '@/shared/application/error/unprocessable-entity.error';
import {
    CompressAlgorithm,
    CompressOptions,
    CompressPort,
} from '@/shared/application/port/compress/compress.repository';
import { LzHandler } from '@/shared/infra/service/lz/lz.handler';

export class LzService implements CompressPort {
    compress(input: string, options?: CompressOptions): string {
        if (!input) return input;

        const algorithm = options?.algorithm || CompressAlgorithm.DEFAULT;

        try {
            switch (algorithm) {
                case CompressAlgorithm.DEFAULT: // Got problems with this one: return LzHandler.compress(input)
                case CompressAlgorithm.UTF16:
                    return LzHandler.compressToUTF16(input).replace(
                        '"',
                        '__LZ__',
                    );
                case CompressAlgorithm.BASE64:
                    return LzHandler.compressToBase64(input);
                case CompressAlgorithm.ENCODED_URI_COMPONENT:
                    return LzHandler.compressToEncodedURIComponent(input);
                case CompressAlgorithm.UINT8:
                    return LzHandler.compressToUint8Array(input).toString();
                default:
                    throw new BadRequestError(
                        'Unsupported compression algorithm',
                    );
            }
        } catch (error) {
            Logger.debug('Error compressing data', { input, error });
            return input;
        }
    }

    decompress(input: string, options?: CompressOptions): string {
        if (!input) return input;

        const algorithm = options?.algorithm || CompressAlgorithm.DEFAULT;

        try {
            switch (algorithm) {
                case CompressAlgorithm.DEFAULT:
                case CompressAlgorithm.UTF16:
                    return LzHandler.decompressFromUTF16(input).replace(
                        '__LZ__',
                        '"',
                    );
                case CompressAlgorithm.BASE64:
                    return LzHandler.decompressFromBase64(input);
                case CompressAlgorithm.ENCODED_URI_COMPONENT:
                    return LzHandler.decompressFromEncodedURIComponent(input);
                case CompressAlgorithm.UINT8:
                    throw new UnprocessableEntityError(
                        'UINT8 decompression not supported from string input',
                    );
                default:
                    throw new BadRequestError(
                        'Unsupported decompression algorithm',
                    );
            }
        } catch (error) {
            Logger.debug('Error decompressing data', { input, error });
            return input;
        }
    }
}
