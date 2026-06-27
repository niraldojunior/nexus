import { createPatch } from 'diff';

import {
    DIFF_DELETE,
    DIFF_INSERT,
    diff_match_patch,
} from '@/shared/infra/service/diff/diff-match-patch-uncompressed';

interface Diff {
    0: number;
    1: string;
}

export class DiffService {
    private service = new diff_match_patch();

    diff(before: string, after: string): Diff[] {
        const diff = this.service.diff_main(before, after);
        this.service.diff_cleanupEfficiency(diff);
        return diff;
    }

    rebuild(diffs: Diff[]): [string, string] {
        let text1 = '';
        let text2 = '';
        // eslint-disable-next-line @typescript-eslint/prefer-for-of
        for (let x = 0; x < diffs.length; x++) {
            if (diffs[x][0] != DIFF_INSERT) {
                text1 += diffs[x][1];
            }
            if (diffs[x][0] != DIFF_DELETE) {
                text2 += diffs[x][1];
            }
        }
        return [text1, text2];
    }

    patch(oldStr: string, newStr: string): string {
        const patch = createPatch('string', oldStr, newStr);
        return patch;
    }
}
