const FNV = {
    OFFSET: 0xcbf29ce484222325n,
    PRIME: 0x00000100000001b3n,
    MASK: 0xffffffffffffffffn,
    OUT_RADIX: 16,
};

export function fnv1a(key: string): string {
    let hash = FNV.OFFSET;

    for (let i = 0; i < key.length; i++) {
        hash ^= BigInt(key.charCodeAt(i));
        hash = (hash * FNV.PRIME) & FNV.MASK;
    }

    return hash.toString(FNV.OUT_RADIX);
}
