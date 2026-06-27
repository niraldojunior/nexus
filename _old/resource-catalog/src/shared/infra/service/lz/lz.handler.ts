import lz from 'lz-string';

export class LzHandler {
    static compress(input: string): string {
        return lz.compress(input);
    }

    static compressToUTF16(input: string): string {
        return lz.compressToUTF16(input);
    }

    static compressToBase64(input: string): string {
        return lz.compressToBase64(input);
    }

    static compressToEncodedURIComponent(input: string): string {
        return lz.compressToEncodedURIComponent(input);
    }

    static compressToUint8Array(input: string): Uint8Array {
        return lz.compressToUint8Array(input);
    }

    static decompress(input: string): string {
        return lz.decompress(input);
    }

    static decompressFromUTF16(input: string): string {
        return lz.decompressFromUTF16(input);
    }

    static decompressFromBase64(input: string): string {
        return lz.decompressFromBase64(input);
    }

    static decompressFromEncodedURIComponent(input: string): string {
        return lz.decompressFromEncodedURIComponent(input);
    }

    static decompressFromUint8Array(input: Uint8Array): string {
        return lz.decompressFromUint8Array(input);
    }
}
