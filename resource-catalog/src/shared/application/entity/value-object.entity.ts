import { safeStringify } from '@/shared/util/json.util';

export abstract class ValueObject<Props> {
    protected props: Props;

    protected constructor(props: Props) {
        this.props = props;
    }

    public equals(vo: ValueObject<unknown>): boolean {
        if (vo === null || vo === undefined) {
            return false;
        }

        if (vo.props === undefined) {
            return false;
        }

        return safeStringify(vo.props) === safeStringify(this.props);
    }
}
