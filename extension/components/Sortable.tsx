import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  type Modifier,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  type SortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

export class ExtensionPointerSensor extends PointerSensor {
  static override activators = PointerSensor.activators
  constructor(props: any) {
    super(props)
    const win = props.event.target?.ownerDocument?.defaultView || window
    win.removeEventListener('resize', (this as any).handleCancel)
    win.removeEventListener('visibilitychange', (this as any).handleCancel)
    win.addEventListener('pointerup', (this as any).handleEnd, { once: true })
    win.addEventListener('mouseup', (this as any).handleEnd, { once: true })
  }
}

const pointerSensorOptions = {
  activationConstraint: {
    distance: 4,
  },
}

const keyboardSensorOptions = {
  coordinateGetter: sortableKeyboardCoordinates,
}

export function Sortable({
  ids,
  onReorder,
  strategy,
  modifiers,
  children,
}: {
  ids: string[]
  onReorder: (ids: string[]) => void
  strategy: SortingStrategy
  modifiers?: Modifier[]
  children: (order: string[]) => ReactNode
}) {
  const [order, setOrder] = useState(ids)
  const lastIdsRef = useRef(ids)
  const isDraggingRef = useRef(false)

  useEffect(() => {
    const hasChanged = ids.length !== lastIdsRef.current.length || ids.some((id, i) => id !== lastIdsRef.current[i])
    lastIdsRef.current = ids

    if (hasChanged && !isDraggingRef.current) {
      setOrder(ids)
    }
  }, [ids])

  const sensors = useSensors(
    useSensor(ExtensionPointerSensor, pointerSensorOptions),
    useSensor(KeyboardSensor, keyboardSensorOptions),
  )

  const onDragStart = () => {
    isDraggingRef.current = true
  }

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    isDraggingRef.current = false
    if (!over || active.id === over.id) {
      return
    }
    const from = order.indexOf(String(active.id))
    const to = order.indexOf(String(over.id))
    if (from < 0 || to < 0) return
    const next = arrayMove(order, from, to)
    setOrder(next)
    lastIdsRef.current = next
    onReorder(next)
  }

  const onDragCancel = () => {
    isDraggingRef.current = false
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={modifiers}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={onDragCancel}
    >
      <SortableContext items={order} strategy={strategy}>
        {children(order)}
      </SortableContext>
    </DndContext>
  )
}

export function useSortableItem(id: string, disabled?: boolean) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled,
  })
  return {
    isDragging,
    itemProps: {
      ref: setNodeRef,
      style: {
        transform: CSS.Translate.toString(transform),
        transition: isDragging ? undefined : transition,
        zIndex: isDragging ? 50 : undefined,
      },
    },
    handleProps: {
      ...attributes,
      ...listeners,
    },
    handleRef: setActivatorNodeRef,
  }
}
