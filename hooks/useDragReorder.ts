"use client";

import { useState, useCallback, useRef } from "react";

/**
 * Hook for drag-and-drop reordering of items in a list.
 * Uses native HTML5 Drag & Drop API — zero dependencies.
 */
export function useDragReorder<T>(
    items: T[],
    setItems: (items: T[]) => void
) {
    const [dragIndex, setDragIndex] = useState<number | null>(null);
    const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
    const dragNodeRef = useRef<HTMLElement | null>(null);

    const handleDragStart = useCallback((e: React.DragEvent, index: number) => {
        setDragIndex(index);
        dragNodeRef.current = e.currentTarget as HTMLElement;

        // Required for Firefox
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", index.toString());

        // Slight delay so the dragged element renders before the ghost image is captured
        requestAnimationFrame(() => {
            if (dragNodeRef.current) {
                dragNodeRef.current.style.opacity = "0.4";
            }
        });
    }, []);

    const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setDragOverIndex(index);
    }, []);

    const handleDragEnter = useCallback((e: React.DragEvent, index: number) => {
        e.preventDefault();
        setDragOverIndex(index);
    }, []);

    const handleDrop = useCallback((e: React.DragEvent, dropIndex: number) => {
        e.preventDefault();

        if (dragIndex === null || dragIndex === dropIndex) {
            setDragIndex(null);
            setDragOverIndex(null);
            return;
        }

        const newItems = [...items];
        const [draggedItem] = newItems.splice(dragIndex, 1);
        newItems.splice(dropIndex, 0, draggedItem);
        setItems(newItems);

        setDragIndex(null);
        setDragOverIndex(null);
    }, [dragIndex, items, setItems]);

    const handleDragEnd = useCallback(() => {
        if (dragNodeRef.current) {
            dragNodeRef.current.style.opacity = "1";
        }
        setDragIndex(null);
        setDragOverIndex(null);
        dragNodeRef.current = null;
    }, []);

    return {
        dragIndex,
        dragOverIndex,
        handleDragStart,
        handleDragOver,
        handleDragEnter,
        handleDrop,
        handleDragEnd,
    };
}
