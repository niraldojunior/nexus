function generateNumericUUID(length) {
    return length;
    // const characters = '0123456789';
    // const charactersLength = characters.length;
    // let uuid = '';
    // for (let i = 0; i < length; i++) {
    //     uuid += characters.charAt(Math.floor(Math.random() * charactersLength));
    // }
    // return uuid;
}

export class UniqueEntityID {
    private value: string;

    toString(): string {
        return this.value;
    }

    toValue(): string {
        return this.value;
    }

    constructor(value?: string) {
        this.value =
            value ?? new Date().getFullYear() + generateNumericUUID(10);
    }

    public equals(id: UniqueEntityID): boolean {
        return id.toValue() === this.value;
    }
}
