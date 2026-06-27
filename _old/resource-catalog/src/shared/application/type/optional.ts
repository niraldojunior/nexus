/**
 * @description
 * Type that makes all properties of T optional except for the ones in K.
 * @example
 * interface Person {
 *   name: string;
 *   age: number;
 *   location: string;
 * }
 *
 * type PersonPartial = Optional<Person, 'location' | 'name'>;
 * // Expect: { name?: string; age?: number; location: string; }
 * const personPartial: PersonPartial = {
 *   location: 'Earth',
 * };
 */

export type Optional<T, K extends keyof T> = Pick<Partial<T>, K> & Omit<T, K>;
