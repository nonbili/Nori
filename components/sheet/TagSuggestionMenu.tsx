import { useEffect, useRef, type ComponentRef } from 'react'
import { Platform, Pressable, ScrollView, View, type StyleProp, type ViewStyle } from 'react-native'
import { NoriText } from '@/components/common/NoriText'

// Web only. A mouse press in the menu, on a row or its scrollbar, would take focus from the tag
// input and close the menu; cancelling it keeps the focus where it is. A click still picks a row.
const keepInputFocus = Platform.OS === 'web'
  ? { onMouseDown: (event: { preventDefault: () => void }) => event.preventDefault() }
  : {}

// Lists the existing tags matching what is typed, floating beside the tag input. Taller lists
// scroll within maxHeight, and the highlighted row is kept in view as the arrow keys move it.
export const TagSuggestionMenu: React.FC<{
  suggestions: string[]
  query: string
  highlighted: number
  onPick: (tag: string) => void
  maxHeight: number
  style?: StyleProp<ViewStyle>
}> = ({ suggestions, query, highlighted, onPick, maxHeight, style }) => {
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null)
  const rows = useRef<{ y: number; height: number }[]>([])
  const scrollY = useRef(0)

  // A new query lists other tags, which start from the top whatever the last list was scrolled to.
  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false })
    scrollY.current = 0
  }, [query])

  useEffect(() => {
    const row = rows.current[highlighted]
    if (!row) return
    if (row.y < scrollY.current) scrollRef.current?.scrollTo({ y: row.y, animated: false })
    else if (row.y + row.height > scrollY.current + maxHeight) {
      scrollRef.current?.scrollTo({ y: row.y + row.height - maxHeight, animated: false })
    }
  }, [highlighted, maxHeight])

  return (
    <View
      className="overflow-hidden rounded-xl border border-line bg-surface shadow-[0_4px_16px_rgba(20,24,40,0.16)] dark:shadow-none"
      style={[{ elevation: 6, maxHeight }, style]}
      {...keepInputFocus}
    >
      <ScrollView
        ref={scrollRef}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
        onScroll={(event) => { scrollY.current = event.nativeEvent.contentOffset.y }}
        scrollEventThrottle={16}
      >
        {suggestions.map((tag, index) => {
          const start = tag.toLowerCase().indexOf(query)
          const end = start + query.length
          return (
            <Pressable
              key={tag}
              onPress={() => onPick(tag)}
              onLayout={({ nativeEvent: { layout } }) => { rows.current[index] = { y: layout.y, height: layout.height } }}
              className={`px-4 py-2.5 active:bg-muted ${index === highlighted ? 'bg-muted' : ''}`}
            >
              <NoriText className="text-sm text-content-muted" numberOfLines={1}>
                {!query || start < 0 ? tag : <>
                  {tag.slice(0, start)}
                  <NoriText className="font-semibold text-content">{tag.slice(start, end)}</NoriText>
                  {tag.slice(end)}
                </>}
              </NoriText>
            </Pressable>
          )
        })}
      </ScrollView>
    </View>
  )
}
