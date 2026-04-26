import React, { memo, useEffect, useRef, useState } from 'react'
import { Modal, Pressable, Text, View, useWindowDimensions } from 'react-native'
import MaterialIcons from '@expo/vector-icons/MaterialIcons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useThemeColors } from '@/lib/theme'
import { Favicon } from './Favicon'

type MenuAction = { label: string; icon: string; handler: () => void }

const AnchorMenu: React.FC<{
  visible: boolean
  anchor: { x: number; y: number; width: number; height: number } | null
  onClose: () => void
  actions: MenuAction[]
}> = ({ visible, anchor, onClose, actions }) => {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const themeColors = useThemeColors()

  const menuWidth = 200
  const menuHeight = actions.length * 44 + 16
  const padding = 8
  const gap = 4

  const top = anchor
    ? (() => {
        const below = anchor.y + anchor.height + gap
        const above = anchor.y - menuHeight - gap
        const maxTop = screenHeight - insets.bottom - menuHeight - padding
        return below <= maxTop ? below : Math.max(above, insets.top + padding)
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
          className="absolute rounded-xl py-2 border border-stone-300 dark:border-stone-700"
          accessibilityViewIsModal={true}
          style={{
            top,
            left,
            width: menuWidth,
            backgroundColor: themeColors.surface,
            borderColor: themeColors.surfaceBorder,
            shadowColor: '#000',
            shadowOpacity: 0.18,
            shadowRadius: 14,
            shadowOffset: { width: 0, height: 8 },
            elevation: 12,
          }}
        >
          {actions.map((action, index) => (
            <Pressable
              key={index}
              accessibilityLabel={action.label}
              accessibilityRole="menuitem"
              className="px-4 flex-row items-center gap-3"
              style={{ minHeight: 44 }}
              android_ripple={{ color: themeColors.surfaceBorder }}
              onPress={() => {
                onClose()
                action.handler()
              }}
            >
              <View accessible={false} importantForAccessibility="no-hide-descendants">
                <MaterialIcons name={action.icon as any} size={18} color={themeColors.iconMuted} />
              </View>
              <Text className="flex-1 text-sm" style={{ color: themeColors.textPrimary }}>{action.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    </Modal>
  )
}

export const BookmarkTile = memo(({
  bookmark,
  editMode,
  onOpen,
  selected,
  onSelect,
  onEnable,
  onEdit,
  onCopyUrl,
  onShare,
  onDelete,
  isDragging,
}: {
  bookmark: { id: string; url: string; title: string; icon?: string }
  editMode: boolean
  onOpen: () => void
  selected?: boolean
  onSelect?: () => void
  onEnable?: () => void
  onEdit?: () => void
  onCopyUrl?: () => void
  onShare?: () => void
  onDelete?: () => void
  isDragging?: boolean
}) => {
  const [menuOpen, setMenuOpen] = useState(false)
  const [anchor, setAnchor] = useState<{ x: number; y: number; width: number; height: number } | null>(null)
  const tileRef = useRef<View>(null)
  const isMounted = useRef(true)

  useEffect(() => {
    return () => {
      isMounted.current = false
    }
  }, [])

  const titleClassName = selected
    ? 'text-emerald-900 dark:text-emerald-100'
    : 'text-stone-800 dark:text-stone-50'

  const handleLongPress = () => {
    tileRef.current?.measureInWindow((x, y, width, height) => {
      if (!isMounted.current) {
        return
      }
      setAnchor({ x, y, width, height })
      setMenuOpen(true)
    })
  }

  const actions: MenuAction[] = [
    { label: 'Edit', icon: 'edit', handler: () => onEdit?.() },
    { label: 'Copy URL', icon: 'content-copy', handler: () => onCopyUrl?.() },
    { label: 'Share', icon: 'share', handler: () => onShare?.() },
    { label: 'Delete', icon: 'delete', handler: () => onDelete?.() },
  ]

  return (
    <View className="w-full gap-2">
      <View ref={tileRef} collapsable={false}>
        <Pressable
          onPress={editMode ? onEnable || onSelect || undefined : onOpen}
          onLongPress={!editMode ? handleLongPress : undefined}
          className={`flex-row items-center gap-2 overflow-hidden rounded-full border px-3 py-2.5 active:bg-stone-100 dark:active:bg-stone-800 ${
            selected
              ? 'border-emerald-500 bg-emerald-100/70 dark:bg-emerald-950/20'
              : 'border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900'
          } ${isDragging ? 'opacity-50' : ''}`}
        >
          <Favicon iconUrl={bookmark.icon} pageUrl={bookmark.url} slotSize={24} iconSize={20} />
          <Text className={`flex-1 text-sm font-medium ${titleClassName}`} numberOfLines={1}>
            {bookmark.title}
          </Text>
        </Pressable>
      </View>
      <AnchorMenu
        visible={menuOpen}
        anchor={anchor}
        onClose={() => setMenuOpen(false)}
        actions={actions}
      />
    </View>
  )
})
BookmarkTile.displayName = 'BookmarkTile'
