import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useApp } from '../AppContext'
import { CenterModal } from '../Overlays'
import { showSnackbar } from '../Snackbar'
import type { NoriList } from '../../lib/model'

export function ListEditor({ list, onClose }: { list?: NoriList; onClose: () => void }) {
  const { t } = useTranslation()
  const { mutate } = useApp()
  const [name, setName] = useState(list?.name || '')
  const [error, setError] = useState('')

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!name.trim()) {
      setError(t('enterListName'))
      return
    }
    if (list) {
      await mutate({ type: 'rename-list', id: list.id, name })
      showSnackbar(t('listUpdated'))
    } else {
      const id = (await mutate({ type: 'add-list', name })) as string | undefined
      if (id) await mutate({ type: 'set-preferences', preferences: { lastListId: id } })
      showSnackbar(t('listCreated'))
    }
    onClose()
  }

  return (
    <CenterModal onClose={onClose}>
      <form className="editor-form" onSubmit={(event) => void submit(event)}>
        <h2 className="m-0 text-xl font-semibold">{list ? t('renameList') : t('newList')}</h2>
        <input
          autoFocus
          className="editor-field"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={t('listName')}
        />
        {error && <p className="m-0 text-xs text-rose-600 dark:text-rose-400">{error}</p>}
        <div className="flex justify-end gap-3">
          <button type="button" className="dialog-button" onClick={onClose}>
            {t('cancel')}
          </button>
          <button type="submit" className="dialog-button primary">
            {t('save')}
          </button>
        </div>
      </form>
    </CenterModal>
  )
}
