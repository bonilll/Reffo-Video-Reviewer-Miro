"use client";

import {
  closestCorners,
  getFirstCollision,
  KeyboardCode,
  DroppableContainer,
  KeyboardCoordinateGetter,
} from '@dnd-kit/core';

const directions: string[] = [
  KeyboardCode.Down,
  KeyboardCode.Right,
  KeyboardCode.Up,
  KeyboardCode.Left,
];

export const coordinateGetter: KeyboardCoordinateGetter = (
  event,
  {context: {active, droppableRects, droppableContainers, collisionRect}}
) => {
  if (directions.includes(event.code)) {
    event.preventDefault();

    if (!active || !collisionRect) {
      return;
    }

    const filteredContainers: DroppableContainer[] = [];

    droppableContainers.getEnabled().forEach((container) => {
      if (container.id in droppableRects) {
        const rect = droppableRects.get(container.id);

        if (rect) {
          switch (event.code) {
            case KeyboardCode.Down:
              if (collisionRect.top < rect.top) {
                filteredContainers.push(container);
              }
              break;
            case KeyboardCode.Up:
              if (collisionRect.top > rect.top) {
                filteredContainers.push(container);
              }
              break;
            case KeyboardCode.Left:
              if (collisionRect.left > rect.left) {
                filteredContainers.push(container);
              }
              break;
            case KeyboardCode.Right:
              if (collisionRect.left < rect.left) {
                filteredContainers.push(container);
              }
              break;
          }
        }
      }
    });

    const collisions = closestCorners({
      active,
      collisionRect,
      droppableRects,
      droppableContainers: filteredContainers,
      pointerCoordinates: null,
    });

    const closestId = getFirstCollision(collisions, 'id');

    if (closestId && droppableRects.get(closestId)) {
      const newDroppable = droppableRects.get(closestId);

      if (newDroppable) {
        if (event.code === KeyboardCode.Down || event.code === KeyboardCode.Up) {
          return {
            x: newDroppable.left + (newDroppable.width / 2),
            y: event.code === KeyboardCode.Down ? 
              newDroppable.top + 20 : 
              newDroppable.top + newDroppable.height - 20,
          };
        }

        if (event.code === KeyboardCode.Left || event.code === KeyboardCode.Right) {
          return {
            x: event.code === KeyboardCode.Right ? 
              newDroppable.left + 20 : 
              newDroppable.left + newDroppable.width - 20,
            y: newDroppable.top + (newDroppable.height / 2),
          };
        }
      }
    }
  }

  return undefined;
}; 