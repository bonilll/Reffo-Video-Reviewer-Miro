"use client";

import React, { useState } from "react";
import {
  DndContext,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragOverEvent,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { DroppableContainer } from "./Container";
import { SortableItem } from "./Item";
import { DragOverlay } from "./DragOverlay";

// Funzione di utilità per generare ID univoci
const createId = () => Math.random().toString(36).substring(2, 10);

// Dati di esempio
const initialContainers = [
  {
    id: "todo",
    title: "Da fare",
  },
  {
    id: "in-progress",
    title: "In corso",
  },
  {
    id: "done",
    title: "Completati",
  },
];

const initialItems = {
  "todo": [
    { id: createId(), title: "Creare componente Item" },
    { id: createId(), title: "Creare componente Container" },
    { id: createId(), title: "Implementare drag and drop" },
  ],
  "in-progress": [
    { id: createId(), title: "Refactoring del codice" },
  ],
  "done": [
    { id: createId(), title: "Setup del progetto" },
    { id: createId(), title: "Creare design system" },
  ],
};

export default function DndExample() {
  const [containers, setContainers] = useState(initialContainers);
  const [items, setItems] = useState(initialItems);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeContainer, setActiveContainer] = useState<string | null>(null);

  // Determina l'elemento attivo in fase di trascinamento
  const findActiveItem = () => {
    if (!activeId) return null;

    for (const containerId in items) {
      const containerItems = items[containerId];
      const activeItem = containerItems.find(item => item.id === activeId);
      if (activeItem) {
        return activeItem;
      }
    }

    return containers.find(container => container.id === activeId) || null;
  };

  // Sensori per il drag and drop
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Gestione inizio trascinamento
  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    setActiveId(active.id as string);

    // Trova il container di appartenenza dell'elemento trascinato
    for (const containerId in items) {
      const containerItems = items[containerId];
      if (containerItems.some(item => item.id === active.id)) {
        setActiveContainer(containerId);
        break;
      }
    }
  };

  // Gestione trascinamento sopra un container
  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    // Trova i container di origine e destinazione
    const activeContainerId = active.data.current?.sortable?.containerId || active.data.current?.containerId;
    const overContainerId = over.data.current?.sortable?.containerId || over.data.current?.containerId || overId;

    // Verifica che entrambi i container esistano e siano validi
    if (!activeContainerId || !overContainerId) return;
    if (!(activeContainerId in items) || !(overContainerId in items)) return;

    if (activeContainerId !== overContainerId) {
      setItems(items => {
        // Assicurati che i contenitori esistano, altrimenti usa array vuoti
        const activeItems = Array.isArray(items[activeContainerId]) ? [...items[activeContainerId]] : [];
        const overItems = Array.isArray(items[overContainerId]) ? [...items[overContainerId]] : [];
        
        // Trova l'indice dell'elemento attivo nel container di origine
        const activeIndex = activeItems.findIndex(item => item.id === activeId);
        
        if (activeIndex !== -1) {
          // Rimuovi l'elemento dal container di origine
          const [item] = activeItems.splice(activeIndex, 1);
          
          // Aggiungi l'elemento al container di destinazione
          overItems.push(item);
          
          return {
            ...items,
            [activeContainerId]: activeItems,
            [overContainerId]: overItems,
          };
        }
        
        return items;
      });

      setActiveContainer(overContainerId);
    }
  };

  // Gestione fine trascinamento
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    
    if (!over) {
      setActiveId(null);
      setActiveContainer(null);
      return;
    }

    const activeId = active.id as string;
    const overId = over.id as string;

    // Gestione ordinamento all'interno dello stesso container
    if (activeContainer && activeContainer in items) {
      const activeIndex = items[activeContainer].findIndex(item => item.id === activeId);
      const overIndex = items[activeContainer].findIndex(item => item.id === overId);
      
      if (activeIndex !== -1 && overIndex !== -1 && activeIndex !== overIndex) {
        setItems(items => ({
          ...items,
          [activeContainer]: arrayMove(items[activeContainer], activeIndex, overIndex),
        }));
      }
    }

    setActiveId(null);
    setActiveContainer(null);
  };

  const activeItem = findActiveItem();

  // Verifica se sono trascinabili i container
  const isContainer = (id: string) => containers.some(container => container.id === id);

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-8">Kanban Board</h1>
      
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="flex flex-wrap gap-4">
          {containers.map(container => (
            <SortableContext
              key={container.id}
              items={items[container.id]?.map(item => item.id) || []}
              strategy={rectSortingStrategy}
            >
              <DroppableContainer
                id={container.id}
                label={container.title}
                items={items[container.id]?.map(item => item.id) || []}
                containerId={container.id}
              >
                {(items[container.id] || []).map(item => (
                  <SortableItem
                    key={item.id}
                    id={item.id}
                    containerId={container.id}
                    value={item.title}
                    handle
                  />
                ))}
              </DroppableContainer>
            </SortableContext>
          ))}
        </div>

        <DragOverlay
          activeId={activeId}
          activeItem={activeItem}
          containerId={activeContainer}
          containerItems={items}
        />
      </DndContext>
    </div>
  );
} 