import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native'
import { NoriText } from '@/components/common/NoriText'

export const MAX_TAG_SUGGESTIONS = 5

// Lists the existing tags matching what is typed, floating over whatever sits above the tag input.
export const TagSuggestionMenu: React.FC<{
  suggestions: string[]
  query: string
  highlighted: number
  onPick: (tag: string) => void
  style?: StyleProp<ViewStyle>
}> = ({ suggestions, query, highlighted, onPick, style }) => (
  <View
    className="overflow-hidden rounded-xl border border-line bg-surface shadow-[0_4px_16px_rgba(20,24,40,0.16)] dark:shadow-none"
    style={[{ elevation: 6 }, style]}
  >
    {suggestions.map((tag, index) => {
      const start = tag.toLowerCase().indexOf(query)
      const end = start + query.length
      return (
        <Pressable
          key={tag}
          onPress={() => onPick(tag)}
          className={`px-4 py-2.5 active:bg-muted ${index === highlighted ? 'bg-muted' : ''}`}
        >
          <NoriText className="text-sm text-content-muted" numberOfLines={1}>
            {start < 0 ? tag : <>
              {tag.slice(0, start)}
              <NoriText className="font-semibold text-content">{tag.slice(start, end)}</NoriText>
              {tag.slice(end)}
            </>}
          </NoriText>
        </Pressable>
      )
    })}
  </View>
)
