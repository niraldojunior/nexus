import type { ResourceTypeRelationshipRule } from '../../services/resourceApi';

export type LinearPlacement = {
  placementPolicy: 'LINEAR';
  position: number;
  span?: number;
};

export type LinearConfiguration = Extract<
  NonNullable<ResourceTypeRelationshipRule['configuration']>,
  { placementPolicy: 'LINEAR' }
>;

export type LinearOccupant<T> = {
  item: T;
  placement: LinearPlacement;
};

export type LinearSlot<T> = {
  position: number;
  label: string;
  occupant?: LinearOccupant<T>;
};

export const linearSpan = (placement: LinearPlacement): number => placement.span ?? 1;

export const linearEnd = (placement: LinearPlacement): number =>
  placement.position + linearSpan(placement) - 1;

export const linearLabel = (configuration: LinearConfiguration, position: number): string => {
  const width = String(configuration.capacity).length;
  return `${configuration.unitLabel}${String(position).padStart(width, '0')}`;
};

export const linearVisualPositions = (configuration: LinearConfiguration): number[] => {
  const positions = Array.from({ length: configuration.capacity }, (_, index) => index + 1);
  return configuration.numberingDirection === 'ascending' ? positions : positions.reverse();
};

export const linearSlots = <T>(
  configuration: LinearConfiguration,
  occupants: LinearOccupant<T>[],
): LinearSlot<T>[] => {
  const occupied = new Map<number, LinearOccupant<T>>();
  for (const occupant of occupants) {
    for (
      let position = occupant.placement.position;
      position <= linearEnd(occupant.placement);
      position += 1
    ) {
      occupied.set(position, occupant);
    }
  }
  return linearVisualPositions(configuration).map((position) => ({
    position,
    label: linearLabel(configuration, position),
    ...(occupied.get(position) ? { occupant: occupied.get(position) } : {}),
  }));
};

export const linearConflictAt = <T>(
  occupants: LinearOccupant<T>[],
  placement: LinearPlacement,
  except?: T,
): LinearOccupant<T> | undefined =>
  occupants.find(
    (occupant) =>
      occupant.item !== except &&
      placement.position <= linearEnd(occupant.placement) &&
      linearEnd(placement) >= occupant.placement.position,
  );

export const linearFits = <T>(
  configuration: LinearConfiguration,
  occupants: LinearOccupant<T>[],
  placement: LinearPlacement,
  except?: T,
): boolean =>
  placement.position >= 1 &&
  linearEnd(placement) <= configuration.capacity &&
  !linearConflictAt(occupants, placement, except);

export const linearBatch = (
  startingPosition: number,
  quantity: number,
  span: number,
): LinearPlacement[] =>
  Array.from({ length: quantity }, (_, index) => ({
    placementPolicy: 'LINEAR',
    position: startingPosition + index * span,
    ...(span > 1 ? { span } : {}),
  }));

export const sequentialName = (prefix: string, startingNumber: number, index: number): string => {
  const number = startingNumber + index;
  const width = Math.max(2, String(startingNumber).length);
  return `${prefix.trim()}-${String(number).padStart(width, '0')}`;
};
