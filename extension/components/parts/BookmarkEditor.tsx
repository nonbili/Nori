import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { getAllTags, getTags } from 'nori/lib/nori-data'
import { normalizeUrlInput } from 'nori/lib/url'
import { useApp } from '../AppContext'
import { Icon } from '../Icon'
import { CenterModal } from '../Overlays'
import { showSnackbar } from '../Snackbar'
import { request } from '../../lib/client'
import type { BookmarkDraft, NoriBookmark } from '../../lib/model'

export function BookmarkEditor({
  bookmark,
  initial,
  onClose,
  onSaved,
}: {
  bookmark?: NoriBookmark
  initial?: Partial<BookmarkDraft>
  onClose: () => void
  onSaved?: (listId: string) => void
}) {
  const { t } = useTranslation()
  const { lists, bookmarks, refresh, setError } = useApp()
  const [draft, setDraft] = useState<BookmarkDraft>({
    listId: bookmark?.listId || initial?.listId || lists[0]?.id || '',
    url: bookmark?.url || initial?.url || '',
    title: bookmark?.title || initial?.title || '',
    icon: bookmark?.icon || initial?.icon || '',
    tags: bookmark ? getTags(bookmark) : initial?.tags || [],
  })
  const [tagInput, setTagInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setLocalError] = useState('')
  const listChipsRef = useRef<HTMLDivElement>(null)
  const activeListChipRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const container = listChipsRef.current
    const activeChip = activeListChipRef.current
    if (!container || !activeChip) return

    const containerRect = container.getBoundingClientRect()
    const chipRect = activeChip.getBoundingClientRect()

    if (chipRect.left < containerRect.left) {
      container.scrollTo({ left: container.scrollLeft + chipRect.left - containerRect.left, behavior: 'auto' })
    } else if (chipRect.right > containerRect.right) {
      container.scrollTo({ left: container.scrollLeft + chipRect.right - containerRect.right, behavior: 'auto' })
    }
  }, [draft.listId])

  const suggestions = getAllTags(bookmarks)
    .filter(
      (tag) =>
        !draft.tags?.some((item) => item.toLowerCase() === tag.toLowerCase()) &&
        (!tagInput.trim() || tag.toLowerCase().includes(tagInput.trim().toLowerCase())),
    )
    .slice(0, 8)

  const addTag = (raw: string) => {
    const tag = raw.trim()
    if (!tag || draft.tags?.some((item) => item.toLowerCase() === tag.toLowerCase())) return
    setDraft((current) => ({ ...current, tags: [...(current.tags || []), tag] }))
  }

  // Commit tokens as they are separated by comma or whitespace; keep the trailing partial.
  const changeTagInput = (value: string) => {
    if (!/[,\s]/.test(value)) return setTagInput(value)
    const parts = value.split(/[,\s]+/)
    const remainder = parts.pop() || ''
    parts.forEach(addTag)
    setTagInput(remainder)
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setLocalError('')
    const normalizedUrl = normalizeUrlInput(draft.url)
    const normalizedDraft = { ...draft, url: normalizedUrl }
    setDraft(normalizedDraft)
    try {
      const tags = [...(draft.tags || [])]
      if (tagInput.trim()) tags.push(tagInput.trim())
      if (bookmark) await request({ type: 'update-bookmark', id: bookmark.id, draft: { ...normalizedDraft, tags } })
      else await request({ type: 'save-bookmark', draft: { ...normalizedDraft, tags } })
      if (!bookmark) await request({ type: 'set-preferences', preferences: { lastListId: draft.listId } })
      await refresh()
      showSnackbar(bookmark ? t('updated') : t('saved'))
      onSaved?.(draft.listId)
      onClose()
    } catch (reason) {
      setLocalError(reason instanceof Error ? reason.message : String(reason))
      setError('')
      setSaving(false)
    }
  }

  return (
    <CenterModal onClose={onClose}>
      <form className="editor-form" noValidate onSubmit={(event) => void submit(event)}>
        <div className="flex items-center justify-between">
          <h2 className="m-0 text-xl font-semibold">{bookmark ? t('editBookmark') : t('addBookmark')}</h2>
          <button type="button" className="round-action" onClick={onClose} aria-label={t('close')}>
            <Icon name="close" size={17} />
          </button>
        </div>
        <div className="grid gap-3">
          <input
            autoFocus={!bookmark}
            className="editor-field"
            required
            type="url"
            value={draft.url}
            onChange={(event) => setDraft({ ...draft, url: event.target.value })}
            onBlur={() => setDraft((current) => ({ ...current, url: normalizeUrlInput(current.url) }))}
            placeholder={t('url')}
          />
          <input
            className="editor-field"
            value={draft.title || ''}
            onChange={(event) => setDraft({ ...draft, title: event.target.value })}
            placeholder={t('titleOptional')}
          />
        </div>
        <div className="grid gap-2">
          {!!draft.tags?.length && (
            <div className="flex flex-wrap gap-2">
              {draft.tags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  className="tag-token"
                  onClick={() => setDraft({ ...draft, tags: draft.tags?.filter((item) => item !== tag) })}
                >
                  {tag}
                  <Icon name="close" size={13} />
                </button>
              ))}
            </div>
          )}
          <input
            className="editor-field"
            value={tagInput}
            onChange={(event) => changeTagInput(event.target.value)}
            onBlur={() => {
              addTag(tagInput)
              setTagInput('')
            }}
            placeholder={t('addTag')}
          />
          {!!suggestions.length && (
            <div className="list-chips flex gap-2 overflow-x-auto">
              {suggestions.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  className="suggestion-chip"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    addTag(tag)
                    setTagInput('')
                  }}
                >
                  {tag}
                </button>
              ))}
            </div>
          )}
        </div>
        <div ref={listChipsRef} className="list-chips flex gap-3 overflow-x-auto">
          {lists.map((list) => (
            <button
              key={list.id}
              ref={draft.listId === list.id ? activeListChipRef : undefined}
              type="button"
              className={`list-chip ${draft.listId === list.id ? 'active' : ''}`}
              onClick={() => setDraft({ ...draft, listId: list.id })}
            >
              {list.name}
            </button>
          ))}
        </div>
        {error && <p className="m-0 text-xs text-rose-600 dark:text-rose-400">{error}</p>}
        <div className="flex justify-end gap-3">
          <button type="button" className="dialog-button" onClick={onClose}>
            {t('cancel')}
          </button>
          <button type="submit" className="dialog-button primary" disabled={saving}>
            {saving ? t('saving') : t('save')}
          </button>
        </div>
      </form>
    </CenterModal>
  )
}
