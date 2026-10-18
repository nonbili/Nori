import React from 'react'
import { Platform, View, useWindowDimensions } from 'react-native'
import { Gesture, GestureDetector, PointerType } from 'react-native-gesture-handler'
import Animated, {
  measure,
  scrollTo,
  useAnimatedReaction,
  useAnimatedRef,
  useAnimatedStyle,
  useFrameCallback,
  useScrollOffset,
  useSharedValue,
  withSpring,
  runOnJS,
  type AnimatedRef,
  type SharedValue,
} from 'react-native-reanimated'

const GAP = 16
const MARGIN_HORIZONTAL = 24
const HOLD_TO_DRAG_MS = 250
// A tile held this close to the top or bottom of the list scrolls it, faster the closer it gets.
const AUTO_SCROLL_EDGE = 72
const AUTO_SCROLL_SPEED = 900

// Web only. A tile lets a finger swipe scroll the page, so once a held tile is being
// dragged the browser has to be stopped from scrolling with it and cancelling the drag.
let touchDragging = false
const setTouchDragging = (dragging: boolean) => {
  touchDragging = dragging
}
const keepTouchOnDrag = (event: TouchEvent) => {
  if (touchDragging && event.cancelable) event.preventDefault()
}

interface SortableGridProps<T extends { id: string }> {
  items: T[]
  containerWidth?: number
  columns?: 1 | 2
  itemHeight: number
  renderItem: (item: T, isDragging: boolean) => React.ReactNode
  onReorder: (newOrder: string[]) => void
  editMode: boolean
  /** The list the grid scrolls in. Only a grid being reordered needs it. */
  scrollViewRef?: AnimatedRef<Animated.ScrollView>
  /** How much of the top of the list sits under a floating header. */
  headerHeight?: number
  trailingItem?: React.ReactNode
}

export function SortableGrid<T extends { id: string }>({
  items,
  containerWidth,
  columns = 2,
  itemHeight,
  renderItem,
  onReorder,
  editMode,
  scrollViewRef,
  headerHeight = 0,
  trailingItem,
}: SortableGridProps<T>) {
  const { width: windowWidth } = useWindowDimensions()
  const width = containerWidth ?? windowWidth
  const gridWidth = width - MARGIN_HORIZONTAL * 2
  const itemWidth = (gridWidth - (columns - 1) * GAP) / columns

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
  }, [items, positions])

  const handleReorder = (newPositions: Record<string, number>) => {
    const orderedIds = Object.keys(newPositions).sort((a, b) => newPositions[a] - newPositions[b])
    onReorder(orderedIds)
  }

  // A held tile is placed from how far the pointer has moved, which says nothing of the list
  // moving under it: the tiles also follow the list's scroll offset, and the list is scrolled
  // while a tile is held at its top or bottom, so a tile can be carried past what is in view.
  const sortable = editMode ? scrollViewRef : undefined
  const scrollOffset = useScrollOffset(sortable ?? null)
  const gridRef = useAnimatedRef<Animated.View>()
  const pointerY = useSharedValue(0)
  const autoScroll = useFrameCallback((frame) => {
    if (!sortable) return
    const view = measure(sortable)
    const grid = measure(gridRef)
    if (!view || !grid) return
    const top = view.pageY + headerHeight
    const bottom = view.pageY + view.height
    const distance = (AUTO_SCROLL_SPEED * Math.min(frame.timeSincePreviousFrame ?? 16, 64)) / 1000
    let step = 0
    if (pointerY.value < top + AUTO_SCROLL_EDGE) {
      const pull = Math.min(1, (top + AUTO_SCROLL_EDGE - pointerY.value) / AUTO_SCROLL_EDGE)
      step = -Math.min(pull * distance, scrollOffset.value)
    } else if (pointerY.value > bottom - AUTO_SCROLL_EDGE) {
      const pull = Math.min(1, (pointerY.value - (bottom - AUTO_SCROLL_EDGE)) / AUTO_SCROLL_EDGE)
      // Stops once the last row is clear of the edge, never past the end of the list.
      step = Math.max(0, Math.min(pull * distance, grid.pageY + grid.height - (bottom - AUTO_SCROLL_EDGE)))
    }
    if (step) scrollTo(sortable, 0, scrollOffset.value + step, false)
  }, false)
  const setDragging = (dragging: boolean) => {
    setTouchDragging(dragging)
    autoScroll.setActive(dragging)
  }

  // A pen sends no touchmove to hold a drag with, so it cannot share the scrollable tiles. It
  // hovers before it touches down, which is when the grid stops the browser panning under it.
  const [penInput, setPenInput] = React.useState(false)
  React.useEffect(() => {
    if (!editMode || Platform.OS !== 'web') return
    const trackPointer = (event: PointerEvent) => setPenInput(event.pointerType === 'pen')
    document.addEventListener('touchmove', keepTouchOnDrag, { passive: false })
    document.addEventListener('pointerover', trackPointer, true)
    document.addEventListener('pointerdown', trackPointer, true)
    return () => {
      document.removeEventListener('touchmove', keepTouchOnDrag)
      document.removeEventListener('pointerover', trackPointer, true)
      document.removeEventListener('pointerdown', trackPointer, true)
      touchDragging = false
      autoScroll.setActive(false)
    }
  }, [editMode, autoScroll])

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
    <Animated.View
      ref={gridRef}
      style={{
        height: Math.ceil(items.length / columns) * (itemHeight + GAP),
        width: gridWidth,
        alignSelf: 'center',
        ...(penInput ? { touchAction: 'none' as const } : null),
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
          columns={columns}
          gap={GAP}
          renderItem={renderItem}
          onDragEnd={handleReorder}
          onDragging={setDragging}
          scrollOffset={scrollOffset}
          pointerY={pointerY}
        />
      ))}
    </Animated.View>
  )
}

interface DraggableTileProps<T> {
  id: string
  item: T
  initialIndex: number
  positions: SharedValue<Record<string, number>>
  itemWidth: number
  itemHeight: number
  columns: number
  gap: number
  renderItem: (item: T, isDragging: boolean) => React.ReactNode
  onDragEnd: (newPositions: Record<string, number>) => void
  onDragging: (dragging: boolean) => void
  scrollOffset: SharedValue<number>
  pointerY: SharedValue<number>
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
  onDragging,
  scrollOffset,
  pointerY,
}: DraggableTileProps<T>) {
  const isDragging = useSharedValue(false)
  const translateX = useSharedValue(0)
  const translateY = useSharedValue(0)
  const startX = useSharedValue(0)
  const startY = useSharedValue(0)
  // How far the pointer has moved, and where the list was scrolled to when the tile was picked up.
  const dragX = useSharedValue(0)
  const dragY = useSharedValue(0)
  const startScroll = useSharedValue(0)
  const startPositions = useSharedValue<Record<string, number>>({})

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

  // Puts the held tile under the pointer and makes room for it where it now is.
  const moveDragged = () => {
    'worklet'
    const x = dragX.value
    const y = dragY.value + scrollOffset.value - startScroll.value
    translateX.value = x
    translateY.value = y

    const centerX = startX.value + x + itemWidth / 2
    const centerY = startY.value + y + itemHeight / 2

    const col = Math.max(0, Math.min(columns - 1, Math.floor(centerX / (itemWidth + gap))))
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
  }

  // The list scrolling under a held tile (the wheel, or the grid scrolling it at an edge) moves
  // the tile's slot without the pointer moving at all. The dependencies are spelled out for the
  // web builds, which have no Babel plugin to work out what the reaction reads.
  useAnimatedReaction(
    () => scrollOffset.value,
    () => {
      if (isDragging.value) moveDragged()
    },
    [scrollOffset, isDragging, positions, dragX, dragY, startScroll, startX, startY, translateX, translateY, id, initialIndex, itemWidth, itemHeight, columns, gap],
  )

  const createPan = () => Gesture.Pan()
    .onStart((event) => {
      startPositions.value = { ...positions.value }
      isDragging.value = true
      const pos = getCoords(positions.value[id] ?? initialIndex)
      startX.value = pos.x
      startY.value = pos.y
      dragX.value = 0
      dragY.value = 0
      startScroll.value = scrollOffset.value
      pointerY.value = event.absoluteY
      runOnJS(onDragging)(true)
    })
    .onUpdate((event) => {
      dragX.value = event.translationX
      dragY.value = event.translationY
      pointerY.value = event.absoluteY
      moveDragged()
    })
    .onEnd((_event, success) => {
      if (success) runOnJS(onDragEnd)(positions.value)
    })
    .onFinalize((_event, success) => {
      if (!isDragging.value) return
      if (!success) positions.value = startPositions.value
      isDragging.value = false
      translateX.value = withSpring(0)
      translateY.value = withSpring(0)
      runOnJS(onDragging)(false)
    })

  // On web a tile covers most of the page, so a finger swipe over it has to scroll. A finger
  // picks a tile up after a short hold instead; the mouse and pen still drag at once.
  const panGesture = Platform.OS === 'web'
    ? Gesture.Race(
        createPan().onTouchesDown((event, state) => {
          if (event.pointerType === PointerType.TOUCH) state.fail()
        }),
        createPan().activateAfterLongPress(HOLD_TO_DRAG_MS).onTouchesDown((event, state) => {
          if (event.pointerType !== PointerType.TOUCH) state.fail()
        }),
      )
    : createPan().activateAfterLongPress(HOLD_TO_DRAG_MS)

  const animatedStyle = useAnimatedStyle(() => {
    const pos = getCoords(positions.value[id] ?? initialIndex)
    return {
      position: 'absolute',
      width: itemWidth,
      height: itemHeight,
      zIndex: isDragging.value ? 100 : 1,
      opacity: isDragging.value ? 0.5 : 1,
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
  }, [getCoords, id, initialIndex, isDragging, itemHeight, itemWidth, positions, startX, startY, translateX, translateY])

  return (
    <GestureDetector gesture={panGesture} touchAction="pan-y">
      <Animated.View style={animatedStyle}>
        {renderItem(item, false)}
      </Animated.View>
    </GestureDetector>
  )
}
