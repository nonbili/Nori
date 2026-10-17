import React, { memo, useEffect, useRef, useState } from 'react'
import { Modal, Platform, Pressable, ScrollView, View, useWindowDimensions } from 'react-native'
import { NoriText } from '@/components/common/NoriText'
import MaterialIcons from '@react-native-vector-icons/material-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useThemeColors } from '@/lib/theme'
import { useTranslation } from 'react-i18next'
import { getBookmarkActionMenuItems } from '@/components/bookmark/BookmarkActionsMenu'
import { type NouMenuItem } from '@/components/menu/NouMenu'
import { Favicon } from './Favicon'
import { BookmarkPreviewContent } from './BookmarkPreviewContent'
import { getNote, getTags } from '@/lib/nori-data'

const AnchorMenu: React.FC<{
  visible: boolean
  anchor: { x: number; y: number; width: number; height: number } | null
  onClose: () => void
  actions: NouMenuItem[]
  title: string
  url: string
  note: string
}> = ({ visible, anchor, onClose, actions, title, url, note }) => {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const themeColors = useThemeColors()

  const padding = 8
  const gap = 4
  const menuWidth = Math.min(280, screenWidth - padding * 2)
  const maxHeight = screenHeight - insets.top - insets.bottom - padding * 2
  const [measuredHeight, setMeasuredHeight] = useState(actions.length * 44 + 16)
  const menuHeight = Math.min(measuredHeight, maxHeight)

  const top = anchor
    ? (() => {
        const below = anchor.y + anchor.height + gap
        const above = anchor.y - menuHeight - gap
        const maxTop = screenHeight - insets.bottom - menuHeight - padding
        return Math.max(insets.top + padding, Math.min(below <= maxTop ? below : above, maxTop))
      })()
    : 0
  const left = anchor
    ? Math.min(
        Math.max(anchor.x, padding),
        screenWidth - menuWidth - padding,
      )
    : 0

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onClose}>
      <View className="flex-1" pointerEvents="box-none">
        <Pressable className="absolute inset-0" onPress={onClose} />
        <View
          className="absolute overflow-hidden rounded-xl border border-line-strong"
          accessibilityViewIsModal={true}
          style={{
            top,
            left,
            width: menuWidth,
            maxHeight,
            backgroundColor: themeColors.surface,
            borderColor: themeColors.line,
            shadowColor: '#000',
            shadowOpacity: 0.18,
            shadowRadius: 14,
            shadowOffset: { width: 0, height: 8 },
            elevation: 12,
          }}
        >
          <ScrollView bounces={false}>
            <View className="py-2" onLayout={(event) => setMeasuredHeight(event.nativeEvent.layout.height)}>
              <View className="mx-4 mb-2 border-b border-line pb-3 pt-1">
                <NoriText className="text-sm font-medium text-content" numberOfLines={2} ellipsizeMode="tail">{title}</NoriText>
                <NoriText className="mt-2 text-xs text-content-muted" numberOfLines={2} ellipsizeMode="tail" selectable>{url}</NoriText>
                {note ? <NoriText className="mt-2 text-xs text-content-secondary" numberOfLines={4} ellipsizeMode="tail" selectable>{note}</NoriText> : null}
              </View>
              {actions.map((action, index) => (
                <Pressable
                  key={index}
                  accessibilityLabel={action.label}
                  accessibilityRole="menuitem"
                  className="px-4 flex-row items-center gap-3"
                  style={{ minHeight: 44 }}
                  android_ripple={{ color: themeColors.line }}
                  onPress={() => {
                    onClose()
                    action.handler?.()
                  }}
                >
                  <View accessible={false} importantForAccessibility="no-hide-descendants">
                    {action.icon ? <MaterialIcons name={action.icon} size={18} color={themeColors.contentMuted} /> : null}
                  </View>
                  <NoriText className="flex-1 text-sm" style={{ color: themeColors.content }}>
                    {action.label}
                  </NoriText>
                </Pressable>
              ))}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  )
}

const MAX_TILE_TAGS = 3

export const BookmarkTile = memo(({
  bookmark,
  preview = false,
  previewHeight,
  editMode,
  onOpen,
  selected,
  onSelect,
  onEnable,
  onEdit,
  onCopyUrl,
  onShare,
  onLoadPreview,
  onDelete,
  isDragging,
}: {
  bookmark: { id: string; url: string; title: string; icon?: string; json?: Record<string, unknown> }
  preview?: boolean
  previewHeight?: number
  editMode: boolean
  onOpen: () => void
  selected?: boolean
  onSelect?: () => void
  onEnable?: () => void
  onEdit?: () => void
  onCopyUrl?: () => void
  onShare?: () => void
  onLoadPreview?: () => void
  onDelete?: () => void
  isDragging?: boolean
}) => {
  const { t } = useTranslation()
  const themeColors = useThemeColors()
  const note = getNote(bookmark)
  const tags = getTags(bookmark)
  const [menuOpen, setMenuOpen] = useState(false)
  const [anchor, setAnchor] = useState<{ x: number; y: number; width: number; height: number } | null>(null)
  const tileRef = useRef<View>(null)
  const isMounted = useRef(true)

  useEffect(() => {
    isMounted.current = true
    return () => {
      isMounted.current = false
    }
  }, [])

  const titleClassName = selected
    ? 'text-accent-900 dark:text-accent-100'
    : 'text-content'

  const handleLongPress = () => {
    tileRef.current?.measureInWindow((x, y, width, height) => {
      if (!isMounted.current) {
        return
      }
      setAnchor({ x, y, width, height })
      setMenuOpen(true)
    })
  }

  const webContextMenuProps = Platform.OS === 'web'
    ? {
        onContextMenu: (event: any) => {
          if (editMode) return
          event.preventDefault()
          event.stopPropagation()
          const nativeEvent = event.nativeEvent || event
          setAnchor({
            x: nativeEvent.clientX ?? nativeEvent.pageX,
            y: nativeEvent.clientY ?? nativeEvent.pageY,
            width: 0,
            height: 0,
          })
          setMenuOpen(true)
        },
      }
    : {}

  const actions = getBookmarkActionMenuItems({
    onEdit,
    onCopyUrl,
    onShare,
    onLoadPreview,
    onDelete,
  }, t)

  return (
    <View className="w-full">
      {preview && !previewHeight && tags.length > 0 ? (
        // Rises off the tile's top edge, on the side away from the note, so its bottom corners stay square.
        <View
          className="max-w-[70%] flex-row items-center gap-1.5 self-end rounded-xl bg-muted px-3 py-1.5"
          style={{ marginRight: 16, borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }}
        >
          <MaterialIcons name="sell" size={16} color={themeColors.contentSecondary} />
          {/* Commas, not the middle dot that page titles often use as a separator. */}
          <NoriText className="shrink text-xs text-content-muted" numberOfLines={1}>
            {tags.slice(0, MAX_TILE_TAGS).join(', ')}
            {tags.length > MAX_TILE_TAGS ? ` +${tags.length - MAX_TILE_TAGS}` : ''}
          </NoriText>
        </View>
      ) : null}
      <View
        ref={tileRef}
        collapsable={false}
        className={`${preview ? 'rounded-2xl' : 'rounded-full'} shadow-[0_1px_3px_rgba(20,24,40,0.12)] dark:shadow-none`}
        {...webContextMenuProps}
      >
        <Pressable
          style={preview && previewHeight ? { height: previewHeight } : undefined}
          onPress={editMode ? onEnable || onSelect || undefined : onOpen}
          onLongPress={!editMode ? handleLongPress : undefined}
          className={`flex-row items-center overflow-hidden border active:bg-muted ${preview ? 'rounded-2xl' : 'gap-2 rounded-full px-3 py-2.5'} ${
            selected
              ? 'border-accent-500 bg-accent-100/70 dark:bg-accent-950/20'
              : 'border-transparent bg-surface'
          } ${isDragging ? 'opacity-50' : ''}`}
        >
          {preview ? <BookmarkPreviewContent bookmark={bookmark} titleClassName={titleClassName} /> : <>
            <Favicon iconUrl={bookmark.icon} pageUrl={bookmark.url} slotSize={24} iconSize={20} />
            <NoriText className={`flex-1 text-sm font-medium ${titleClassName}`} numberOfLines={1}>
              {bookmark.title}
            </NoriText>
          </>}
        </Pressable>
      </View>
      {/* A reorder row has a fixed height with no room for the note under it. */}
      {preview && !previewHeight && note ? (
        // Hangs off the tile's bottom edge like a tab, so its top corners stay square.
        <View
          className="flex-row gap-1.5 self-start rounded-xl bg-accent-100 px-3 py-1.5 dark:bg-accent-950/40"
          style={{ marginLeft: 16, borderTopLeftRadius: 0, borderTopRightRadius: 0 }}
        >
          <MaterialIcons name="edit-note" size={16} color={themeColors.contentSecondary} />
          <NoriText className="shrink text-xs text-accent-900 dark:text-accent-100" numberOfLines={2}>
            {note}
          </NoriText>
        </View>
      ) : null}
      <AnchorMenu
        visible={menuOpen}
        anchor={anchor}
        onClose={() => setMenuOpen(false)}
        actions={actions}
        title={bookmark.title}
        url={bookmark.url}
        note={note}
      />
    </View>
  )
})
BookmarkTile.displayName = 'BookmarkTile'
