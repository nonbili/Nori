import React from 'react'
import { View, useWindowDimensions } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
  type AnimatedRef,
} from 'react-native-reanimated'

const COLUMNS = 2
const GAP = 16
const MARGIN_HORIZONTAL = 24

interface SortableGridProps<T extends { id: string }> {
  items: T[]
  itemHeight: number
  renderItem: (item: T, isDragging: boolean) => React.ReactNode
  onReorder: (newOrder: string[]) => void
  editMode: boolean
  scrollViewRef: AnimatedRef<Animated.ScrollView>
  headerHeight?: number
  trailingItem?: React.ReactNode
}

export function SortableGrid<T extends { id: string }>({
  items,
  itemHeight,
  renderItem,
  onReorder,
  editMode,
  scrollViewRef,
  headerHeight = 0,
  trailingItem,
}: SortableGridProps<T>) {
  const { width } = useWindowDimensions()
  const gridWidth = width - MARGIN_HORIZONTAL * 2
  const itemWidth = (gridWidth - (COLUMNS - 1) * GAP) / COLUMNS

  // Map item ID to its current index
  const positions = useSharedValue<Record<string, number>>(
    Object.fromEntries(items.map((item, index) => [item.id, index])),
  )

  // Update positions when items change (add/remove)
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

  if (!editMode) {
    return (
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: GAP,
          width: gridWidth,
          alignSelf: 'center',
        }}
      >
        {items.map((item) => (
          <View key={item.id} style={{ width: itemWidth }}>
            {renderItem(item, false)}
          </View>
        ))}
        {trailingItem ? <View style={{ width: itemWidth }}>{trailingItem}</View> : null}
      </View>
    )
  }

  return (
    <View
      style={{
        height: Math.ceil(items.length / COLUMNS) * (itemHeight + GAP),
        width: gridWidth,
        alignSelf: 'center',
      }}
    >
      {items.map((item, index) => (
        <DraggableTile
          key={item.id}
          id={item.id}
          item={item}
          initialIndex={index}
          positions={positions}
          itemWidth={itemWidth}
          itemHeight={itemHeight}
          columns={COLUMNS}
          gap={GAP}
          renderItem={renderItem}
          onDragEnd={handleReorder}
          scrollViewRef={scrollViewRef}
          headerHeight={headerHeight}
        />
      ))}
    </View>
  )
}

interface DraggableTileProps<T> {
  id: string
  item: T
  initialIndex: number
  positions: Animated.SharedValue<Record<string, number>>
  itemWidth: number
  itemHeight: number
  columns: number
  gap: number
  renderItem: (item: T, isDragging: boolean) => React.ReactNode
  onDragEnd: (newPositions: Record<string, number>) => void
  scrollViewRef: AnimatedRef<Animated.ScrollView>
  headerHeight: number
}

function DraggableTile<T extends { id: string }>({
  id,
  item,
  initialIndex,
  positions,
  itemWidth,
  itemHeight,
  columns,
  gap,
  renderItem,
  onDragEnd,
  scrollViewRef,
  headerHeight,
}: DraggableTileProps<T>) {
  const isDragging = useSharedValue(false)
  const translateX = useSharedValue(0)
  const translateY = useSharedValue(0)
  const startX = useSharedValue(0)
  const startY = useSharedValue(0)

  const getCoords = (index: number) => {
    'worklet'
    const safeIndex = index ?? initialIndex
    const col = safeIndex % columns
    const row = Math.floor(safeIndex / columns)
    return {
      x: col * (itemWidth + gap),
      y: row * (itemHeight + gap),
    }
  }

  const panGesture = Gesture.Pan()
    .onStart(() => {
      isDragging.value = true
      const pos = getCoords(positions.value[id] ?? initialIndex)
      startX.value = pos.x
      startY.value = pos.y
    })
    .onUpdate((event) => {
      translateX.value = event.translationX
      translateY.value = event.translationY

      const centerX = startX.value + event.translationX + itemWidth / 2
      const centerY = startY.value + event.translationY + itemHeight / 2

      const col = Math.floor(centerX / (itemWidth + gap))
      const row = Math.floor(centerY / (itemHeight + gap))
      const newIndex = Math.min(
        Math.max(row * columns + col, 0),
        Object.keys(positions.value).length - 1,
      )

      if (newIndex !== positions.value[id]) {
        const oldIndex = positions.value[id] ?? initialIndex
        const newPositions = { ...positions.value }

        // Shift logic
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
      translateX.value = withSpring(0)
      translateY.value = withSpring(0)
      runOnJS(onDragEnd)(positions.value)
    })

  const animatedStyle = useAnimatedStyle(() => {
    const pos = getCoords(positions.value[id] ?? initialIndex)
    return {
      position: 'absolute',
      width: itemWidth,
      height: itemHeight,
      zIndex: isDragging.value ? 100 : 1,
      transform: [
        { translateX: isDragging.value ? startX.value + translateX.value : withSpring(pos.x) },
        { translateY: isDragging.value ? startY.value + translateY.value : withSpring(pos.y) },
        { scale: withSpring(isDragging.value ? 1.05 : 1) },
      ],
      shadowColor: '#000',
      shadowOffset: { width: 0, height: isDragging.value ? 10 : 0 },
      shadowOpacity: isDragging.value ? 0.3 : 0,
      shadowRadius: isDragging.value ? 20 : 0,
      elevation: isDragging.value ? 10 : 0,
    }
  })

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View style={animatedStyle}>
        {renderItem(item, isDragging.value)}
      </Animated.View>
    </GestureDetector>
  )
}
