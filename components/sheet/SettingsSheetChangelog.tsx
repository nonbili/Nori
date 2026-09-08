import { useEffect, useState } from 'react'
import { ActivityIndicator, Linking, Pressable, View } from 'react-native'
import { NoriText } from '@/components/common/NoriText'
import MaterialIcons from '@react-native-vector-icons/material-icons'
import { useTranslation } from 'react-i18next'
import { fetchReleaseEntries, type ReleaseEntry } from '@/lib/changelog'
import { useThemeColors } from '@/lib/theme'

const formatReleaseDate = (value: string) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date)
}

const cardCls = 'overflow-hidden rounded-[24px] border border-line bg-surface/90 dark:bg-surface/70'

export const SettingsChangelogPage: React.FC<{ appVersion: string }> = ({ appVersion }) => {
  const { t } = useTranslation()
  const themeColors = useThemeColors()
  const [entries, setEntries] = useState<ReleaseEntry[] | null>(null)
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(true)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(false)

    fetchReleaseEntries()
      .then((data) => {
        if (!cancelled) {
          setEntries(data)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError(true)
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [attempt])

  if (loading) {
    return (
      <View className={`${cardCls} flex-row items-center gap-3 px-4 py-6`}>
        <ActivityIndicator color={themeColors.contentMuted} />
        <NoriText className="text-sm text-content-muted">{t('settings.changelog.loading')}</NoriText>
      </View>
    )
  }

  if (error) {
    return (
      <View className="gap-4">
        <View className={cardCls}>
          <NoriText className="px-4 py-4 text-sm leading-6 text-content-muted">{t('settings.changelog.error')}</NoriText>
        </View>
        <View className="items-end">
          <Pressable
            onPress={() => setAttempt((value) => value + 1)}
            accessibilityRole="button"
            className="rounded-full border border-line px-4 py-2 active:opacity-70"
          >
            <NoriText className="text-sm font-medium text-content">{t('settings.changelog.retry')}</NoriText>
          </Pressable>
        </View>
      </View>
    )
  }

  if (!entries?.length) {
    return (
      <View className={cardCls}>
        <NoriText className="px-4 py-4 text-sm text-content-muted">{t('settings.changelog.empty')}</NoriText>
      </View>
    )
  }

  return (
    <>
      {entries.map((entry) => {
        const isCurrent = entry.tag === `v${appVersion}`

        return (
          <Pressable
            key={entry.url}
            onPress={() => void Linking.openURL(entry.url)}
            accessibilityRole="link"
            className={`${cardCls} px-4 py-4 active:opacity-70`}
          >
            <View className="flex-row items-start gap-3">
              <View className="h-10 w-10 items-center justify-center rounded-2xl border border-line bg-inset">
                <MaterialIcons name="history" color={isCurrent ? themeColors.accent : themeColors.contentMuted} size={18} />
              </View>
              <View className="flex-1">
                <View className="flex-row items-center gap-2">
                  <NoriText className="flex-1 font-medium text-content">{entry.tag}</NoriText>
                  {isCurrent ? (
                    <NoriText className="rounded-full border border-line px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-content-muted">
                      {t('settings.changelog.current')}
                    </NoriText>
                  ) : null}
                </View>
                <NoriText className="mt-1 text-sm text-content-muted">{formatReleaseDate(entry.updatedAt)}</NoriText>
                <View className="mt-3 gap-2">
                  {entry.items.length ? (
                    entry.items.map((item) => (
                      <View className="flex-row gap-2" key={`${entry.url}-${item}`}>
                        <NoriText className="text-sm leading-5 text-content-muted">{'•'}</NoriText>
                        <NoriText className="flex-1 text-sm leading-5 text-content">{item}</NoriText>
                      </View>
                    ))
                  ) : (
                    <NoriText className="text-sm leading-5 text-content-muted">{t('settings.changelog.noNotes')}</NoriText>
                  )}
                </View>
              </View>
              <MaterialIcons name="open-in-new" color={themeColors.contentMuted} size={18} />
            </View>
          </Pressable>
        )
      })}
    </>
  )
}
