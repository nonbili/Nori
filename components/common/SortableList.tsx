import React from 'react'
import { View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
} from 'react-native-reanimated'

interface SortableListProps<T extends { id: string }> {
  items: T[]
  itemHeight: number
  renderItem: (item: T, isDragging: boolean, dragGesture: any) => React.ReactNode
  onReorder: (newOrder: string[]) => void
  gap?: number
  dragHandleOnly?: boolean
}

export function SortableList<T extends { id: string }>({
  items,
  itemHeight,
  renderItem,
  onReorder,
  gap = 12,
  dragHandleOnly = false,
}: SortableListProps<T>) {
  // Map item ID to its current index
  const positions = useSharedValue<Record<string, number>>(
    Object.fromEntries(items.map((item, index) => [item.id, index])),
  )

  // Update positions when items change
  React.useEffect(() => {
    const next: Record<string, number> = {}
    items.forEach((item, index) => {
      next[item.id] = index
    })
    positions.value = next
  }, [items])

  const handleReorder = (newPositions: Record<string, number>) => {
    const orderedIds = Object.keys(newPositions).sort((a, b) => newPositions[a] - newPositions[b])
    onReorder(orderedIds)
  }

  return (
    <View style={{ height: items.length * (itemHeight + gap) }}>
      {items.map((item, index) => (
        <DraggableRow
          key={item.id}
          id={item.id}
          item={item}
          initialIndex={index}
          positions={positions}
          itemHeight={itemHeight}
          gap={gap}
          renderItem={renderItem}
          onDragEnd={handleReorder}
          dragHandleOnly={dragHandleOnly}
        />
      ))}
    </View>
  )
}

interface DraggableRowProps<T> {
  id: string
  item: T
  initialIndex: number
  positions: Animated.SharedValue<Record<string, number>>
  itemHeight: number
  gap: number
  renderItem: (item: T, isDragging: boolean, dragGesture: any) => React.ReactNode
  onDragEnd: (newPositions: Record<string, number>) => void
  dragHandleOnly: boolean
}

function DraggableRow<T extends { id: string }>({
  id,
  item,
  initialIndex,
  positions,
  itemHeight,
  gap,
  renderItem,
  onDragEnd,
  dragHandleOnly,
}: DraggableRowProps<T>) {
  const isDragging = useSharedValue(false)
  const translateY = useSharedValue(0)
  const startY = useSharedValue(0)

  const panGesture = Gesture.Pan()
    .onStart(() => {
      isDragging.value = true
      startY.value = (positions.value[id] ?? initialIndex) * (itemHeight + gap)
    })
    .onUpdate((event) => {
      translateY.value = event.translationY

      const currentY = startY.value + event.translationY + itemHeight / 2
      const newIndex = Math.min(
        Math.max(Math.floor(currentY / (itemHeight + gap)), 0),
        Object.keys(positions.value).length - 1,
      )

      if (newIndex !== positions.value[id]) {
        const oldIndex = positions.value[id] ?? initialIndex
        const newPositions = { ...positions.value }

        for (const key in newPositions) {
          if (key === id) continue
          const pos = newPositions[key]!
          if (oldIndex < newIndex) {
            if (pos > oldIndex && pos <= newIndex) {
              newPositions[key] = pos - 1
            }
          } else {
            if (pos >= newIndex && pos < oldIndex) {
              newPositions[key] = pos + 1
            }
          }
        }
        newPositions[id] = newIndex
        positions.value = newPositions
      }
    })
    .onEnd(() => {
      isDragging.value = false
      translateY.value = withSpring(0)
      runOnJS(onDragEnd)(positions.value)
    })

  const animatedStyle = useAnimatedStyle(() => {
    const pos = (positions.value[id] ?? initialIndex) * (itemHeight + gap)
    return {
      position: 'absolute',
      left: 0,
      right: 0,
      height: itemHeight,
      zIndex: isDragging.value ? 100 : 1,
      transform: [
        { translateY: isDragging.value ? startY.value + translateY.value : withSpring(pos) },
        { scale: withSpring(isDragging.value ? 1.02 : 1) },
      ],
      shadowColor: '#000',
      shadowOffset: { width: 0, height: isDragging.value ? 4 : 0 },
      shadowOpacity: isDragging.value ? 0.2 : 0,
      shadowRadius: isDragging.value ? 8 : 0,
      elevation: isDragging.value ? 5 : 0,
    }
  })

  if (dragHandleOnly) {
    return (
      <Animated.View style={animatedStyle}>
        {renderItem(item, isDragging.value, panGesture)}
      </Animated.View>
    )
  }

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View style={animatedStyle}>
        {renderItem(item, isDragging.value, null)}
      </Animated.View>
    </GestureDetector>
  )
}
