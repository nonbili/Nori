import { ReactNode, useRef, useState } from 'react'
import { Modal, Pressable as NativePressable, Text, useWindowDimensions, View } from 'react-native'
import MaterialIcons from '@expo/vector-icons/MaterialIcons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useThemeColors } from '@/lib/theme'

export interface NouMenuItem {
  label: string
  handler: () => void
  selected?: boolean
  icon?: keyof typeof MaterialIcons.glyphMap
}

export const NouMenu: React.FC<{
  trigger: ReactNode
  items: NouMenuItem[]
  testID?: string
  accessibilityLabel?: string
}> = ({ trigger, items, testID, accessibilityLabel }) => {
  const [open, setOpen] = useState(false)
  const [anchor, setAnchor] = useState<{ x: number; y: number; width: number; height: number } | null>(null)
  const themeColors = useThemeColors()
  const { width: screenWidth, height: screenHeight } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const triggerRef = useRef<View>(null)
  const menuWidth = 220
  const itemHeight = 44
  const menuHeight = items.length * itemHeight + 16

  const openMenu = () => {
    triggerRef.current?.measureInWindow((x, y, width, height) => {
      setAnchor({ x, y, width, height })
      setOpen(true)
    })
  }

  const closeMenu = () => setOpen(false)

  const horizontalPadding = 8
  const verticalPadding = 8
  const triggerGap = 4
  const minTop = insets.top + verticalPadding
  const maxTop = Math.max(minTop, screenHeight - insets.bottom - menuHeight - verticalPadding)
  const top = anchor
    ? (() => {
        const belowTop = anchor.y + anchor.height + triggerGap
        const aboveTop = anchor.y + anchor.height - menuHeight - triggerGap
        const fitsBelow = belowTop <= maxTop
        const preferredTop = fitsBelow ? belowTop : aboveTop
        return Math.min(Math.max(preferredTop, minTop), maxTop)
      })()
    : minTop
  const left = anchor
    ? Math.min(
        Math.max(anchor.x + anchor.width - menuWidth, horizontalPadding),
        Math.max(horizontalPadding, screenWidth - menuWidth - horizontalPadding),
      )
    : horizontalPadding

  return (
    <>
      <View ref={triggerRef} collapsable={false}>
        <NativePressable
          onPress={openMenu}
          hitSlop={12}
          testID={testID}
          accessibilityLabel={accessibilityLabel}
          accessibilityRole="button"
        >
          {trigger}
        </NativePressable>
      </View>
      {open && (
        <Modal transparent visible={open} animationType="none" onRequestClose={closeMenu}>
          <View className="flex-1" pointerEvents="box-none">
            <NativePressable className="absolute inset-0" onPress={closeMenu} />
            <View
              className="absolute rounded-xl border py-2"
              accessibilityViewIsModal={true}
              style={{
                top,
                left,
                width: menuWidth,
                backgroundColor: themeColors.surface,
                borderColor: themeColors.surfaceBorder,
              }}
            >
              {items.map((item, index) => (
                <NativePressable
                  key={index}
                  testID={`menu_item_${item.label.toLowerCase().replace(/\s+/g, '_')}`}
                  accessibilityLabel={item.label}
                  accessibilityRole="menuitem"
                  className="flex-row items-center px-4"
                  style={{ minHeight: itemHeight }}
                  onPress={() => {
                    closeMenu()
                    item.handler()
                  }}
                >
                  <View className="mr-3 w-5 items-center" accessible={false} importantForAccessibility="no-hide-descendants">
                    {item.icon ? (
                      <MaterialIcons
                        name={item.icon}
                        size={18}
                        color={themeColors.icon}
                      />
                    ) : null}
                  </View>
                  <Text className="flex-1" style={{ color: themeColors.textPrimary }}>{item.label}</Text>
                  {item.selected ? (
                    <View accessible={false} importantForAccessibility="no-hide-descendants">
                      <MaterialIcons name="check" size={18} color={themeColors.iconAccentStrong} />
                    </View>
                  ) : null}
                </NativePressable>
              ))}
            </View>
          </View>
        </Modal>
      )}
    </>
  )
}
